"use server"

import { getPostbackApiUrl } from "@lib/config"

type PostbackData = {
  clickId: string | null | undefined
  amount: number
  itemName: string
  quantity: number
  transactionId: string
  status?: string
}

type PostbackResponse = {
  isSuccess: boolean
  message: string
  value: {
    id: number
    clickId: string
    offerId: number
    transactionId: string
    date: string
    publisherCode: string
    amount: number
    status: number
    offer: null | any // Can be typed more specifically if offer structure is known
  }
}

export async function postbackLog(data: PostbackData) {
  try {
    console.log("Sending postback with data:", data)

    const response = await fetch(
      `${getPostbackApiUrl()}/api/affiliate-network/postbacks/log`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    )

    const res = await response.json()
    console.log("Postback response:", res)

    return res
  } catch (error) {
    console.error("Postback error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      data: data,
    })
    return null
  }
}

export async function postbackLogUpdate(clickId: string, data: PostbackData) {
  try {
    console.log("Sending postback with data:", data)
    const response = await fetch(
      `${getPostbackApiUrl()}/api/affiliate-network/postbacks/log/${clickId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    )

    const res = await response.json()
    console.log("Postback response:", res)

    return res
  } catch (error) {
    console.error("Postback error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      data: data,
    })
    return null
  }
}

export async function getPostbackLog(transactionId: string) {
  try {
    console.log("Fetching postback log for clickId:", transactionId)
    const response = await fetch(
      `${getPostbackApiUrl()}/api/affiliate-network/postbacks/log/${transactionId}/transaction`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    )

    const res = await response.json()
    console.log("Postback log response:", res)

    return res
  } catch (error) {
    console.error("Postback error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      transactionId: transactionId,
    })
    return null
  }
}

export async function postback(data: PostbackData) {
  try {
    console.log("Sending postback")
    const response = await fetch(
      `${getPostbackApiUrl()}/api/affiliate-network/postbacks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    )
    const res = await response.json()
    console.log("Postback response:", res)
    return res
  } catch (error) {
    console.error("Postback error:", error)
    return null
  }
}

export async function postbackReturn(itemId: string) {
  try {
    console.log("Sending postback", itemId)
    const postback = await getPostbackByItemId(itemId)
    if (postback) {
      console.log("Postback found:", postback)
      console.log("Postback value:", postback.value)
      const response = await fetch(
        `${getPostbackApiUrl()}/api/affiliate-network/postbacks?id=${
          postback.value.id
        }&status=Refunded`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
      const res = await response.json()
      console.log("Postback response:", res)
      return res
    } else {
      console.log("No postback found")
      return null
    }
  } catch (error) {
    console.error("Postback error:", error)
  }
}

export async function getPostbackByItemId(
  itemId: string
): Promise<PostbackResponse | null> {
  try {
    console.log("Fetching postback by itemId:", itemId)
    const response = await fetch(
      `${getPostbackApiUrl()}/api/affiliate-network/postbacks/${itemId}`
    )
    const res: PostbackResponse = await response.json()
    console.log("Postback response:", res)
    return res
  } catch (error) {
    console.error("Postback error:", error)
    return null
  }
}
