import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { placeOrder, seedStore, Store } from "../store"

jest.setTimeout(120 * 1000)

// No custom code: checkout and the admin API only
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let store: Store
    let orderId: string
    let lineId: string

    beforeEach(async () => {
      store = await seedStore(getContainer())
      orderId = await placeOrder(getContainer(), store, 2)
      const order = await getContainer().resolve(Modules.ORDER).retrieveOrder(orderId, { relations: ["items"] })
      lineId = order.items![0].id
    })

    const post = (path: string, body: object = {}) =>
      api.post(path, body, store.admin).catch((e: any) => e.response)

    const edit = async (quantity: number) => {
      await post("/admin/order-edits", { order_id: orderId })
      await post(`/admin/order-edits/${orderId}/items/item/${lineId}`, { quantity })
      await post(`/admin/order-edits/${orderId}/request`)
      return post(`/admin/order-edits/${orderId}/confirm`)
    }

    const stock = async () => {
      const inventory = getContainer().resolve(Modules.INVENTORY)
      const reservations = await inventory.listReservationItems({ line_item_id: [lineId] })
      const [level] = await inventory.listInventoryLevels({ inventory_item_id: store.inventoryItemId })
      return {
        reservations: reservations.map((r) => Number(r.quantity)).sort(),
        reserved: Number(level.reserved_quantity),
        stocked: Number(level.stocked_quantity),
      }
    }

    // an edit the stock allows, then one it does not
    const editAndFail = async () => {
      expect((await edit(1)).status).toBe(200)
      const before = await stock()
      const failed = await edit(50)
      console.log(`confirm of the second edit: ${failed.status} ${failed.data.message}`)
      expect(failed.status).toBe(400)
      return before
    }

    it("a failed order edit leaves the reservations as they were", async () => {
      const before = await editAndFail()
      const after = await stock()
      console.log("before", JSON.stringify(before), "after", JSON.stringify(after))
      expect(after).toEqual(before)
    })

    it("the order ships once after a failed order edit", async () => {
      await editAndFail()
      await api.delete(`/admin/order-edits/${orderId}`, store.admin)
      const res = await post(`/admin/orders/${orderId}/fulfillments`, { items: [{ id: lineId, quantity: 1 }], location_id: store.location.id })
      const order = (await api.get(`/admin/orders/${orderId}?fields=*fulfillments,*fulfillments.items`, store.admin)).data.order
      const items = order.fulfillments.flatMap((f: any) => f.items.map((i: any) => Number(i.quantity)))
      console.log("fulfillment", res.status, res.data.message ?? "", "items", JSON.stringify(items), "stock", JSON.stringify(await stock()))
      expect(items).toEqual([1])
      expect(await stock()).toEqual({ reservations: [], reserved: 0, stocked: 9 })
    })
  },
})
