const API_BASE = "http://localhost:8787"

const fetchActiveTask = async () => {
  const response = await fetch(`${API_BASE}/tasks/active`)
  if (!response.ok) {
    throw new Error("Unable to load active task")
  }

  return response.json()
}

const fetchQueueDaemonHealth = async () => {
  const response = await fetch(`${API_BASE}/automation/queue-daemon/health`)
  if (!response.ok) {
    throw new Error("Unable to load queue daemon health")
  }

  return response.json()
}

const fetchProductWorkItems = async () => {
  const response = await fetch(`${API_BASE}/dianxiaomi/product-work-items?limit=50`)
  if (!response.ok) {
    throw new Error("Unable to load Dianxiaomi product work items")
  }

  return response.json()
}

const normalizePageUrl = (value) => {
  try {
    const url = new URL(value)
    url.hash = ""
    return url.toString()
  } catch {
    return String(value ?? "").trim()
  }
}

const findCurrentWorkItem = (items, pageUrl) => {
  const normalizedPageUrl = normalizePageUrl(pageUrl)
  if (!normalizedPageUrl) {
    return null
  }

  return items.find((item) => normalizePageUrl(item.pageUrl) === normalizedPageUrl) ?? null
}

const fetchUnattendedStatus = async (pageUrl) => {
  const [health, workItems] = await Promise.all([
    fetchQueueDaemonHealth(),
    fetchProductWorkItems()
  ])

  return {
    checkedAt: new Date().toISOString(),
    health,
    currentWorkItem: findCurrentWorkItem(workItems, pageUrl),
    workItemCount: workItems.length
  }
}

const uploadDebugSnapshot = async (snapshot) => {
  const response = await fetch(`${API_BASE}/debug-snapshots`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(snapshot)
  })

  if (!response.ok) {
    throw new Error("Unable to upload debug snapshot")
  }

  return response.json()
}

const uploadCollectedProduct = async (product) => {
  const response = await fetch(`${API_BASE}/dianxiaomi/collected-products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(product)
  })

  if (!response.ok) {
    throw new Error("Unable to upload collected product")
  }

  return response.json()
}

const uploadProductWorkItem = async (workItem) => {
  const response = await fetch(`${API_BASE}/dianxiaomi/product-work-items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(workItem)
  })

  if (!response.ok) {
    throw new Error("Unable to queue Dianxiaomi product work item")
  }

  return response.json()
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "temu-ai/get-active-task") {
    fetchActiveTask()
      .then((task) => {
        sendResponse({
          ok: true,
          task
        })
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          message: String(error)
        })
      })

    return true
  }

  if (message?.type === "temu-ai/get-unattended-status") {
    fetchUnattendedStatus(message.payload?.pageUrl)
      .then((status) => {
        sendResponse({
          ok: true,
          status
        })
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          message: String(error)
        })
      })

    return true
  }

  if (message?.type === "temu-ai/upload-debug-snapshot") {
    uploadDebugSnapshot(message.payload)
      .then((snapshot) => {
        sendResponse({
          ok: true,
          snapshot
        })
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          message: String(error)
        })
      })

    return true
  }

  if (message?.type === "temu-ai/upload-collected-product") {
    uploadCollectedProduct(message.payload)
      .then((product) => {
        sendResponse({
          ok: true,
          product
        })
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          message: String(error)
        })
      })

    return true
  }

  if (message?.type === "temu-ai/upload-product-work-item") {
    uploadProductWorkItem(message.payload)
      .then((workItem) => {
        sendResponse({
          ok: true,
          workItem
        })
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          message: String(error)
        })
      })

    return true
  }

  if (message?.type === "temu-ai/log") {
    console.log("[Temu AI Plugin]", message.payload)
    sendResponse?.({
      ok: true
    })
    return false
  }

  return false
})
