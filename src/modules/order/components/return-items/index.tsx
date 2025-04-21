"use client"

import { useState, ChangeEvent, useEffect } from "react"
import { HttpTypes } from "@medusajs/types"
import {
  Button,
  Table,
  Text,
  clx,
  Input,
  Select,
  Checkbox,
  Textarea,
} from "@medusajs/ui"
import {
  createReturn,
  listReturnReasons,
  listReturnShippingOptions,
  listStockLocations,
} from "@lib/data/orders"
import Thumbnail from "@modules/products/components/thumbnail"
import { useRouter } from "next/navigation"

type ReturnItemsProps = {
  order: HttpTypes.StoreOrder
}

const ReturnItems = ({ order }: ReturnItemsProps) => {
  const router = useRouter()
  const [selectedItems, setSelectedItems] = useState<{
    [key: string]: {
      quantity: number
      max: number
      reason_id?: string
      note?: string
    }
  }>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [returnNote, setReturnNote] = useState("")
  // const [receiveNow, setReceiveNow] = useState(false)
  // const [selectedLocation, setSelectedLocation] = useState("")
  const [shippingOption, setShippingOption] = useState<{
    option_id: string
    price: number
  } | null>(null)

  // State for the fetched data
  const [returnReasons, setReturnReasons] = useState<
    HttpTypes.StoreReturnReason[]
  >([])
  const [shippingOptions, setShippingOptions] = useState<
    HttpTypes.StoreShippingOption[]
  >([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [reasons, shipping] = await Promise.all([
          listReturnReasons(),
          listReturnShippingOptions(),
        ])

        console.log("reasons", reasons)
        console.log("shipping", shipping)

        setReturnReasons(reasons || [])
        setShippingOptions(shipping || [])

        // Set default shipping option if available
        if (shipping && shipping.length > 0) {
          setShippingOption({
            option_id: shipping[0].id,
            price: shipping[0].amount || 0,
          })
        }
      } catch (err) {
        console.error("Error fetching return data:", err)
        setError("Failed to load return options. Please try again later.")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [order.id])

  const handleQuantityChange = (
    itemId: string,
    quantity: number,
    max: number
  ) => {
    if (quantity < 0) return
    if (quantity > max) quantity = max

    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        quantity,
        max,
      },
    }))
    setSuccess(false)
  }

  const handleItemReasonChange = (itemId: string, reason_id: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        reason_id,
      },
    }))
  }

  const handleItemNoteChange = (itemId: string, note: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        note,
      },
    }))
  }

  const handleSubmit = async () => {
    if (!shippingOption) {
      setError("Please select a shipping option")
      return
    }

    setSubmitting(true)
    setError(null)
    setSuccess(false)

    const items = Object.entries(selectedItems)
      .filter(([_, { quantity }]) => quantity > 0)
      .map(([id, { quantity, reason_id, note }]) => ({
        id,
        quantity,
        reason_id,
        note,
      }))

    if (items.length === 0) {
      setError("Please select at least one item to return")
      setSubmitting(false)
      return
    }

    try {
      await createReturn(
        order.id,
        items,
        shippingOption,
        returnNote || undefined
        // receiveNow,
        // selectedLocation || undefined
      )
      setSuccess(true)
      router.refresh()
      // Reset form
      setSelectedItems({})
      setReturnNote("")
      // setReceiveNow(false)
      // setSelectedLocation("")
      if (shippingOptions.length > 0) {
        setShippingOption({
          option_id: shippingOptions[0].id,
          price: shippingOptions[0].amount || 0,
        })
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create return. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center py-12">
        <Text>Loading return options...</Text>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <Text className="text-xl font-semibold">Return Items</Text>
      </div>

      {success ? (
        <div className="bg-green-50 p-4 rounded-lg mb-4">
          <Text className="text-green-600">
            Return request submitted successfully! Our team will process your
            request shortly.
          </Text>
        </div>
      ) : (
        <>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Product</Table.HeaderCell>
                <Table.HeaderCell>Quantity to Return</Table.HeaderCell>
                <Table.HeaderCell>Reason</Table.HeaderCell>
                <Table.HeaderCell>Note</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {order.items?.map((item) => {
                const maxQuantity = item.quantity
                const selected = selectedItems[item.id]?.quantity || 0

                return (
                  <Table.Row key={item.id}>
                    <Table.Cell>
                      <div className="flex items-center gap-x-3">
                        <div className="w-[50px]">
                          <Thumbnail
                            thumbnail={item.thumbnail}
                            images={[]}
                            size="full"
                          />
                        </div>
                        <div>
                          <Text className="font-medium">{item.title}</Text>
                          {item.variant && (
                            <Text className="text-sm text-ui-fg-subtle">
                              {item.variant.title}
                            </Text>
                          )}
                        </div>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-x-2">
                        <Button
                          variant="transparent"
                          onClick={() =>
                            handleQuantityChange(
                              item.id,
                              (selected || 0) - 1,
                              maxQuantity
                            )
                          }
                          disabled={!selected}
                        >
                          -
                        </Button>
                        <span className="w-8 text-center">{selected}</span>
                        <Button
                          variant="transparent"
                          onClick={() =>
                            handleQuantityChange(
                              item.id,
                              (selected || 0) + 1,
                              maxQuantity
                            )
                          }
                          disabled={selected >= maxQuantity}
                        >
                          +
                        </Button>
                        <span className="text-ui-fg-subtle">
                          (max: {maxQuantity})
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <select
                        value={selectedItems[item.id]?.reason_id || ""}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                          handleItemReasonChange(item.id, e.target.value)
                        }
                        disabled={!selected}
                        className="w-full p-2 border rounded"
                        aria-label={`Return reason for ${item.title}`}
                      >
                        <option value="">Select a reason</option>
                        {returnReasons.map((reason) => (
                          <option key={reason.id} value={reason.id}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    </Table.Cell>
                    <Table.Cell>
                      <Input
                        type="text"
                        value={selectedItems[item.id]?.note || ""}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          handleItemNoteChange(item.id, e.target.value)
                        }
                        placeholder="Add a note (optional)"
                        disabled={!selected}
                      />
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>

          <div className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="shipping-method"
                className="text-ui-fg-base mb-2 block"
              >
                Shipping Method
              </label>
              <select
                id="shipping-method"
                value={shippingOption?.option_id || ""}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  const option = shippingOptions.find(
                    (opt) => opt.id === e.target.value
                  )
                  if (option) {
                    setShippingOption({
                      option_id: option.id,
                      price: option.amount || 0,
                    })
                  }
                }}
                className="w-full p-2 border rounded"
              >
                <option value="">Select a shipping method</option>
                {shippingOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} (
                    {option.amount === 0 ? "Free" : `$${option.amount / 100}`})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="return-note"
                className="text-ui-fg-base mb-2 block"
              >
                Additional Notes
              </label>
              <Textarea
                id="return-note"
                value={returnNote}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  setReturnNote(e.target.value)
                }
                placeholder="Add any additional notes about the return (optional)"
                rows={3}
              />
            </div>

            {/* <div className="flex items-center gap-x-2">
              <label className="flex items-center gap-x-2">
                <input
                  type="checkbox"
                  checked={receiveNow}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setReceiveNow(e.target.checked)
                  }
                  className="h-4 w-4"
                />
                <span>Mark items as received immediately</span>
              </label>
            </div> */}
          </div>

          {error && (
            <Text className="text-red-500 mt-4" role="alert">
              {error}
            </Text>
          )}

          <div className="flex justify-end mt-6">
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={submitting}
              className={clx("min-w-[200px]", {
                "opacity-50 cursor-not-allowed": submitting,
              })}
            >
              {submitting ? "Processing..." : "Submit Return Request"}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export default ReturnItems
