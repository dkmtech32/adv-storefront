"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { getAuthHeaders, getCacheOptions } from "./cookies"
import { HttpTypes } from "@medusajs/types"
import axios from "axios"
import { postbackReturn } from "./postback"

export const retrieveOrder = async (id: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("orders")),
  }

  return sdk.client
    .fetch<HttpTypes.StoreOrderResponse>(`/store/orders/${id}`, {
      method: "GET",
      query: {
        fields:
          "*payment_collections.payments,*items,*items.metadata,*items.variant,*items.product",
      },
      headers,
      next,
      cache: "force-cache",
    })
    .then(({ order }) => order)
    .catch((err) => medusaError(err))
}

export const listOrders = async (
  limit: number = 10,
  offset: number = 0,
  filters?: Record<string, any>
) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("orders")),
  }

  return sdk.client
    .fetch<HttpTypes.StoreOrderListResponse>(`/store/orders`, {
      method: "GET",
      query: {
        limit,
        offset,
        order: "-created_at",
        fields: "*items,+items.metadata,*items.variant,*items.product",
        ...filters,
      },
      headers,
      next,
      cache: "force-cache",
    })
    .then(({ orders }) => orders)
    .catch((err) => medusaError(err))
}

export const createTransferRequest = async (
  state: {
    success: boolean
    error: string | null
    order: HttpTypes.StoreOrder | null
  },
  formData: FormData
): Promise<{
  success: boolean
  error: string | null
  order: HttpTypes.StoreOrder | null
}> => {
  const id = formData.get("order_id") as string

  if (!id) {
    return { success: false, error: "Order ID is required", order: null }
  }

  const headers = await getAuthHeaders()

  return await sdk.store.order
    .requestTransfer(
      id,
      {},
      {
        fields: "id, email",
      },
      headers
    )
    .then(({ order }) => ({ success: true, error: null, order }))
    .catch((err) => ({ success: false, error: err.message, order: null }))
}

export const acceptTransferRequest = async (id: string, token: string) => {
  const headers = await getAuthHeaders()

  return await sdk.store.order
    .acceptTransfer(id, { token }, {}, headers)
    .then(({ order }) => ({ success: true, error: null, order }))
    .catch((err) => ({ success: false, error: err.message, order: null }))
}

export const declineTransferRequest = async (id: string, token: string) => {
  const headers = await getAuthHeaders()

  return await sdk.store.order
    .declineTransfer(id, { token }, {}, headers)
    .then(({ order }) => ({ success: true, error: null, order }))
    .catch((err) => ({ success: false, error: err.message, order: null }))
}

export const createReturn = async (
  orderId: string,
  items: {
    id: string
    quantity: number
    reason_id?: string
    note?: string
  }[],
  return_shipping: {
    option_id: string
    price?: number
  },
  note?: string,
  receive_now?: boolean,
  location_id?: string
) => {
  try {
    // Validate environment variables
    if (!process.env.MEDUSA_BACKEND_URL) {
      console.error("MEDUSA_BACKEND_URL is not defined")
      throw new Error(
        "Missing required environment variable: MEDUSA_BACKEND_URL"
      )
    }

    if (!process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY) {
      console.error("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY is not defined")
      throw new Error(
        "Missing required environment variable: NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY"
      )
    }

    const headers = {
      ...(await getAuthHeaders()),
      "x-publishable-api-key":
        process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "",
    }

    // Validate required parameters
    if (!orderId) {
      throw new Error("Order ID is required")
    }

    if (!items || !items.length) {
      throw new Error("At least one item is required")
    }

    if (!return_shipping || !return_shipping.option_id) {
      throw new Error("Return shipping option is required")
    }

    const response = await axios.post<HttpTypes.StoreReturnResponse>(
      `${process.env.MEDUSA_BACKEND_URL}/store/returns`,
      {
        order_id: orderId,
        items,
        return_shipping,
        note,
        // receive_now,
      },
      {
        headers,
      }
    )

    // Update postback status to return
    for (const item of items) {
      await postbackReturn(item.id)
    }

    return response.data.return
  } catch (err) {
    console.error("Error creating return:", err)
    return medusaError(err)
  }
}

export const listReturnReasons = async () => {
  const headers = {
    ...(await getAuthHeaders()),
    "x-publishable-api-key":
      process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "",
  }

  return axios
    .get<{ return_reasons: HttpTypes.StoreReturnReason[] }>(
      `${process.env.MEDUSA_BACKEND_URL}/store/return-reasons`,
      {
        headers,
      }
    )
    .then((response) => response.data.return_reasons)
    .catch((err) => {
      console.error(
        "Error fetching return reasons:",
        err.response?.data || err.message
      )
      return []
    })
}

export const listReturnShippingOptions = async () => {
  const headers = {
    ...(await getAuthHeaders()),
    "x-publishable-api-key": process.env.MEDUSA_PUBLISHABLE_KEY || "",
  }

  const cartId = process.env.CART_ID_EXAMPLE

  return axios
    .get<{ shipping_options: HttpTypes.StoreShippingOption[] }>(
      `${process.env.MEDUSA_BACKEND_URL}/store/shipping-options?cart_id=${cartId}`,
      {
        headers,
      }
    )
    .then((response) => response.data.shipping_options)
    .catch((err) => {
      console.error(
        "Error fetching shipping options:",
        err.response?.data || err.message
      )
      return []
    })
}

export const listStockLocations = async () => {
  const headers = {
    ...(await getAuthHeaders()),
    "x-publishable-api-key":
      process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "",
  }

  return axios
    .get<{ stock_locations: any[] }>(
      `${process.env.MEDUSA_BACKEND_URL}/store/stock-locations`,
      {
        headers,
      }
    )
    .then((response) => response.data.stock_locations)
    .catch((err) => {
      console.error(
        "Error fetching stock locations:",
        err.response?.data || err.message
      )
      return []
    })
}
