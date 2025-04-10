"use server"

type PostbackData = {
  clickId: string | null
  amount: number
  itemName: string
  quantity: number
  transactionId: string
}

export async function postback(data: PostbackData) {
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
