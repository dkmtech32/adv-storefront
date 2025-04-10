"use server"

type PostbackData = {
  clickId: string | null | undefined
  amount: number
  itemName: string
  quantity: number
  transactionId: string
}

export async function postbackLog(data: PostbackData) {
  try {
    console.log("Sending postback with data:", data)

    const response = await fetch(
      "http://localhost:5272/api/affiliate-network/postbacks/log",
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
      `http://localhost:5272/api/affiliate-network/postbacks/log/${clickId}`,
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
      `http://localhost:5272/api/affiliate-network/postbacks/log/${transactionId}/transaction`,
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
      "http://localhost:5272/api/affiliate-network/postbacks",
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
