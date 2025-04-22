"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  removeCartId,
  setCartId,
} from "./cookies"
import { getRegion } from "./regions"
import {
  postbackLog,
  getPostbackLog,
  postbackLogUpdate,
  postback,
} from "./postback"

/**
 * Retrieves a cart by its ID. If no ID is provided, it will use the cart ID from the cookies.
 * @param cartId - optional - The ID of the cart to retrieve.
 * @returns The cart object if found, or null if not found.
 */
export async function retrieveCart(cartId?: string) {
  const id = cartId || (await getCartId())

  if (!id) {
    return null
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("carts")),
  }

  return await sdk.client
    .fetch<HttpTypes.StoreCartResponse>(`/store/carts/${id}`, {
      method: "GET",
      query: {
        fields:
          "*items, *region, *items.product, *items.variant, *items.thumbnail, *items.metadata, +items.total, *promotions, +shipping_methods.name",
      },
      headers,
      next,
      cache: "force-cache",
    })
    .then(({ cart }) => cart)
    .catch(() => null)
}

export async function getOrSetCart(countryCode: string) {
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  let cart = await retrieveCart()

  const headers = {
    ...(await getAuthHeaders()),
  }

  if (!cart) {
    const cartResp = await sdk.store.cart.create(
      { region_id: region.id },
      {},
      headers
    )
    cart = cartResp.cart

    await setCartId(cart.id)

    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag)
  }

  if (cart && cart?.region_id !== region.id) {
    await sdk.store.cart.update(cart.id, { region_id: region.id }, {}, headers)
    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag)
  }

  return cart
}

export async function updateCart(data: HttpTypes.StoreUpdateCart) {
  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("No existing cart found, please create one before updating")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .update(cartId, data, {}, headers)
    .then(async ({ cart }) => {
      if (!cart.items) {
        console.log("Cart items is undefined")
        return cart
      }
      // Get all line items that have been updated
      for (const item of cart.items) {
        try {
          // Fetch existing postback log for this transaction
          const postbackLogData = await getPostbackLog(item.id)

          if (postbackLogData?.isSuccess && postbackLogData.value?.length > 0) {
            const existingPostback = postbackLogData.value[0]
            console.log("Updating postback for line item:", {
              lineItemId: item.id,
              clickId: existingPostback.clickId,
            })

            // Update the postback log with new data
            await postbackLogUpdate(existingPostback.clickId, {
              clickId: existingPostback.clickId,
              amount: item.unit_price * item.quantity - item.discount_total,
              itemName: item.title || item.variant?.title || "Unknown Item",
              quantity: item.quantity,
              transactionId: item.id,
            })
          }
        } catch (error) {
          console.error("Error updating postback for line item:", {
            lineItemId: item.id,
            error: error instanceof Error ? error.message : "Unknown error",
          })
        }
      }

      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)

      return cart
    })
    .catch(medusaError)
}

export async function addToCart({
  variantId,
  quantity,
  countryCode,
  clickId,
}: {
  variantId: string
  quantity: number
  countryCode: string
  clickId?: string | null
}) {
  if (!variantId) {
    throw new Error("Missing variant ID when adding to cart")
  }

  const cart = await getOrSetCart(countryCode)

  if (!cart) {
    throw new Error("Error retrieving or creating cart")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const result = await sdk.store.cart
    .createLineItem(
      cart.id,
      {
        variant_id: variantId,
        quantity,
      },
      {},
      headers
    )
    .then(async (response) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)

      return response
    })
    .catch(medusaError)
  console.log("Result of adding to cart:", result)
  console.log("clickId:", clickId)
  // Send postback if clickId is provided and line item was created successfully
  if (clickId && result?.cart?.items) {
    console.log("Cart items:", result.cart.items)

    const newLineItem = result.cart.items.find(
      (item) => item.variant_id === variantId
    )
    if (newLineItem) {
      console.log("Triggering postback for line item:", {
        lineItemId: newLineItem.id,
        clickId: clickId,
      })

      await postbackLog({
        clickId,
        amount:
          newLineItem.unit_price * newLineItem.quantity -
          newLineItem.discount_total, // Converting from cents to actual currency
        itemName:
          newLineItem.title || newLineItem.variant?.title || "Unknown Item",
        quantity: newLineItem.quantity,
        transactionId: newLineItem.id,
      })
    } else {
      console.log("New line item not found in cart items after addition", {
        variantId,
        clickId,
        cartItems: result.cart.items.map((item) => ({
          id: item.id,
          variantId: item.variant_id,
        })),
      })
    }
  }

  return result
}

export async function updateLineItem({
  lineId,
  quantity,
}: {
  lineId: string
  quantity: number
}) {
  if (!lineId) {
    throw new Error("Missing lineItem ID when updating line item")
  }

  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("Missing cart ID when updating line item")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.cart
    .updateLineItem(cartId, lineId, { quantity }, {}, headers)
    .then(async ({ cart }) => {
      try {
        const updatedItem = cart.items?.find((item) => item.id === lineId)
        console.log("Updated item:", updatedItem)
        if (!updatedItem) {
          console.log("Updated line item not found in cart response", {
            lineId,
          })
          return
        }

        // Fetch existing postback log for this transaction
        const postbackLogData = await getPostbackLog(lineId)
        console.log("Postback log data:", postbackLogData)

        // Check if we have a successful response with data
        if (postbackLogData?.isSuccess && postbackLogData.value?.length > 0) {
          const existingPostback = postbackLogData.value[0]
          console.log("Updating postback for line item:", {
            lineItemId: lineId,
            clickId: existingPostback.clickId,
          })

          // Update the postback log with new data
          await postbackLogUpdate(existingPostback.clickId, {
            clickId: existingPostback.clickId,
            amount:
              updatedItem.unit_price * updatedItem.quantity -
              updatedItem.discount_total,
            itemName:
              updatedItem.title || updatedItem.variant?.title || "Unknown Item",
            quantity: updatedItem.quantity,
            transactionId: lineId,
          })
        }
      } catch (error) {
        console.error("Error updating postback for line item:", {
          lineItemId: lineId,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }

      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)
    })
    .catch(medusaError)
}

export async function deleteLineItem(lineId: string) {
  if (!lineId) {
    throw new Error("Missing lineItem ID when deleting line item")
  }

  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("Missing cart ID when deleting line item")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.cart
    .deleteLineItem(cartId, lineId, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)
    })
    .catch(medusaError)
}

export async function setShippingMethod({
  cartId,
  shippingMethodId,
}: {
  cartId: string
  shippingMethodId: string
}) {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .addShippingMethod(cartId, { option_id: shippingMethodId }, {}, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
    })
    .catch(medusaError)
}

export async function initiatePaymentSession(
  cart: HttpTypes.StoreCart,
  data: HttpTypes.StoreInitializePaymentSession
) {
  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.payment
    .initiatePaymentSession(cart, data, {}, headers)
    .then(async (resp) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return resp
    })
    .catch(medusaError)
}

export async function applyPromotions(codes: string[]) {
  const cartId = await getCartId()

  if (!cartId) {
    throw new Error("No existing cart found")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .update(cartId, { promo_codes: codes }, {}, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)
    })
    .catch(medusaError)
}

export async function applyGiftCard(code: string) {
  //   const cartId = getCartId()
  //   if (!cartId) return "No cartId cookie found"
  //   try {
  //     await updateCart(cartId, { gift_cards: [{ code }] }).then(() => {
  //       revalidateTag("cart")
  //     })
  //   } catch (error: any) {
  //     throw error
  //   }
}

export async function removeDiscount(code: string) {
  // const cartId = getCartId()
  // if (!cartId) return "No cartId cookie found"
  // try {
  //   await deleteDiscount(cartId, code)
  //   revalidateTag("cart")
  // } catch (error: any) {
  //   throw error
  // }
}

export async function removeGiftCard(
  codeToRemove: string,
  giftCards: any[]
  // giftCards: GiftCard[]
) {
  //   const cartId = getCartId()
  //   if (!cartId) return "No cartId cookie found"
  //   try {
  //     await updateCart(cartId, {
  //       gift_cards: [...giftCards]
  //         .filter((gc) => gc.code !== codeToRemove)
  //         .map((gc) => ({ code: gc.code })),
  //     }).then(() => {
  //       revalidateTag("cart")
  //     })
  //   } catch (error: any) {
  //     throw error
  //   }
}

export async function submitPromotionForm(
  currentState: unknown,
  formData: FormData
) {
  const code = formData.get("code") as string
  try {
    await applyPromotions([code])
  } catch (e: any) {
    return e.message
  }
}

// TODO: Pass a POJO instead of a form entity here
export async function setAddresses(currentState: unknown, formData: FormData) {
  try {
    if (!formData) {
      throw new Error("No form data found when setting addresses")
    }
    const cartId = getCartId()
    if (!cartId) {
      throw new Error("No existing cart found when setting addresses")
    }

    const data = {
      shipping_address: {
        first_name: formData.get("shipping_address.first_name"),
        last_name: formData.get("shipping_address.last_name"),
        address_1: formData.get("shipping_address.address_1"),
        address_2: "",
        company: formData.get("shipping_address.company"),
        postal_code: formData.get("shipping_address.postal_code"),
        city: formData.get("shipping_address.city"),
        country_code: formData.get("shipping_address.country_code"),
        province: formData.get("shipping_address.province"),
        phone: formData.get("shipping_address.phone"),
      },
      email: formData.get("email"),
    } as any

    const sameAsBilling = formData.get("same_as_billing")
    if (sameAsBilling === "on") data.billing_address = data.shipping_address

    if (sameAsBilling !== "on")
      data.billing_address = {
        first_name: formData.get("billing_address.first_name"),
        last_name: formData.get("billing_address.last_name"),
        address_1: formData.get("billing_address.address_1"),
        address_2: "",
        company: formData.get("billing_address.company"),
        postal_code: formData.get("billing_address.postal_code"),
        city: formData.get("billing_address.city"),
        country_code: formData.get("billing_address.country_code"),
        province: formData.get("billing_address.province"),
        phone: formData.get("billing_address.phone"),
      }
    await updateCart(data)
  } catch (e: any) {
    return e.message
  }

  redirect(
    `/${formData.get("shipping_address.country_code")}/checkout?step=delivery`
  )
}

/**
 * Places an order for a cart. If no cart ID is provided, it will use the cart ID from the cookies.
 * @param cartId - optional - The ID of the cart to place an order for.
 * @returns The cart object if the order was successful, or null if not.
 */
export async function placeOrder(cartId?: string) {
  const id = cartId || (await getCartId())
  console.log("cartId", id)
  if (!id) {
    throw new Error("No existing cart found when placing an order")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }
  const cartRetrieved = await retrieveCart(id)
  if (!cartRetrieved?.items) {
    throw new Error("No items found in cart when placing order")
  }
  const cartLineItemsMap = new Map(
    cartRetrieved.items.map((item) => [item.variant_id, item.id])
  )

  const cartRes = await sdk.store.cart
    .complete(id, {}, headers)
    .then(async (cartRes) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return cartRes
    })
    .catch(medusaError)
  if (cartRes?.type === "order") {
    const countryCode =
      cartRes.order.shipping_address?.country_code?.toLowerCase()

    // Handle postback updates for each line item
    if (cartRes.order.items) {
      for (const orderItem of cartRes.order.items) {
        try {
          // Get the original cart line item ID using the variant ID
          const cartLineItemId = cartLineItemsMap.get(
            orderItem.variant_id ?? ""
          )
          if (!cartLineItemId) {
            console.error(
              "Could not find matching cart line item for order item:",
              orderItem
            )
            continue
          }

          // Get the postback data using the cart line item ID
          const postbackLogData = await getPostbackLog(cartLineItemId)
          if (postbackLogData?.isSuccess && postbackLogData.value?.length > 0) {
            const existingPostback = postbackLogData.value[0]
            console.log("Updating postback for order item:", {
              cartLineItemId: cartLineItemId,
              orderLineItemId: orderItem.id,
              clickId: existingPostback.clickId,
            })

            // Update the postback log with the order line item ID
            await postbackLogUpdate(existingPostback.clickId, {
              clickId: existingPostback.clickId,
              amount:
                orderItem.unit_price * orderItem.quantity -
                orderItem.discount_total,
              itemName:
                orderItem.title || orderItem.variant?.title || "Unknown Item",
              quantity: orderItem.quantity,
              transactionId: orderItem.id, // Using order line item ID
            })

            // Send final postback
            console.log("Sending final postback for order item:", {
              cartLineItemId: cartLineItemId,
              orderLineItemId: orderItem.id,
              clickId: existingPostback.clickId,
            })
            await postback({
              clickId: existingPostback.clickId,
              amount:
                orderItem.unit_price * orderItem.quantity -
                orderItem.discount_total,
              itemName:
                orderItem.title || orderItem.variant?.title || "Unknown Item",
              quantity: orderItem.quantity,
              transactionId: orderItem.id,
              status: "Success",
            })
          }
        } catch (error) {
          console.error("Error updating postback for order item:", {
            cartLineItemId: orderItem.id,
            orderLineItemId: orderItem.id,
            error: error instanceof Error ? error.message : "Unknown error",
          })
        }
      }
    }

    const orderCacheTag = await getCacheTag("orders")
    revalidateTag(orderCacheTag)

    removeCartId()
    redirect(`/${countryCode}/order/${cartRes?.order.id}/confirmed`)
  }

  return cartRes.cart
}

/**
 * Updates the countrycode param and revalidates the regions cache
 * @param regionId
 * @param countryCode
 */
export async function updateRegion(countryCode: string, currentPath: string) {
  const cartId = await getCartId()
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  if (cartId) {
    await updateCart({ region_id: region.id })
    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag)
  }

  const regionCacheTag = await getCacheTag("regions")
  revalidateTag(regionCacheTag)

  const productsCacheTag = await getCacheTag("products")
  revalidateTag(productsCacheTag)

  redirect(`/${countryCode}${currentPath}`)
}

export async function listCartOptions() {
  const cartId = await getCartId()
  const headers = {
    ...(await getAuthHeaders()),
  }
  const next = {
    ...(await getCacheOptions("shippingOptions")),
  }

  return await sdk.client.fetch<{
    shipping_options: HttpTypes.StoreCartShippingOption[]
  }>("/store/shipping-options", {
    query: { cart_id: cartId },
    next,
    headers,
    cache: "force-cache",
  })
}
