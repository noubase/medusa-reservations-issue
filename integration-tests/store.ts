import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  addShippingMethodToCartWorkflow,
  completeCartWorkflow,
  createApiKeysWorkflow,
  createCartWorkflow,
  createPaymentCollectionForCartWorkflow,
  createPaymentSessionsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"

const PROVIDER = "manual_manual"

// A store with one variant at 300 EUR, 10 in stock, and free shipping
export async function seedStore(container: MedusaContainer) {
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillment = container.resolve(Modules.FULFILLMENT)
  const inventory = container.resolve(Modules.INVENTORY)

  const { result: [channel] } = await createSalesChannelsWorkflow(container).run({
    input: { salesChannelsData: [{ name: "Webshop" }] },
  })
  const { result: [region] } = await createRegionsWorkflow(container).run({
    input: { regions: [{ name: "EU", currency_code: "eur", countries: ["de"], payment_providers: ["pp_system_default"] }] },
  })
  const { result: [location] } = await createStockLocationsWorkflow(container).run({
    input: { locations: [{ name: "Warehouse" }] },
  })
  await linkSalesChannelsToStockLocationWorkflow(container).run({ input: { id: location.id, add: [channel.id] } })
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: PROVIDER },
  })
  const { result: [profile] } = await createShippingProfilesWorkflow(container).run({
    input: { data: [{ name: "Default", type: "default" }] },
  })
  const set = await fulfillment.createFulfillmentSets({
    name: "Delivery",
    type: "shipping",
    service_zones: [{ name: "DE", geo_zones: [{ type: "country", country_code: "de" }] }],
  })
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: set.id },
  })
  const { result: [option] } = await createShippingOptionsWorkflow(container).run({
    input: [{
      name: "Standard", price_type: "flat", provider_id: PROVIDER,
      service_zone_id: set.service_zones[0].id, shipping_profile_id: profile.id,
      type: { label: "Standard", description: "Standard", code: "standard" },
      prices: [{ currency_code: "eur", amount: 0 }],
    }],
  })
  const { result: [product] } = await createProductsWorkflow(container).run({
    input: {
      products: [{
        title: "Socks", status: "published", shipping_profile_id: profile.id,
        sales_channels: [{ id: channel.id }],
        options: [{ title: "Size", values: ["M"] }],
        variants: [{ title: "M", sku: "SOCKS-M", options: { Size: "M" }, manage_inventory: true, prices: [{ currency_code: "eur", amount: 300 }] }],
      }],
    },
  })
  const [item] = await inventory.listInventoryItems({ sku: "SOCKS-M" })
  await inventory.createInventoryLevels({ inventory_item_id: item.id, location_id: location.id, stocked_quantity: 10 })
  const { result: [key] } = await createApiKeysWorkflow(container).run({
    input: { api_keys: [{ title: "Admin", type: "secret", created_by: "test" }] },
  })

  return {
    channel, region, location, option, inventoryItemId: item.id, variantId: product.variants[0].id,
    admin: { headers: { authorization: `Basic ${Buffer.from(`${key.token}:`).toString("base64")}` } },
  }
}

export type Store = Awaited<ReturnType<typeof seedStore>>

// An order placed through checkout, so its line has a reservation
export async function placeOrder(container: MedusaContainer, store: Store, quantity: number) {
  const address = { first_name: "Jane", last_name: "Doe", address_1: "Street 1", city: "Berlin", postal_code: "10115", country_code: "de" }
  const { result: cart } = await createCartWorkflow(container).run({
    input: {
      region_id: store.region.id, sales_channel_id: store.channel.id, email: "jane@example.com",
      items: [{ variant_id: store.variantId, quantity }], shipping_address: address, billing_address: address,
    },
  })
  await addShippingMethodToCartWorkflow(container).run({ input: { cart_id: cart.id, options: [{ id: store.option.id }] } })
  await createPaymentCollectionForCartWorkflow(container).run({ input: { cart_id: cart.id } })
  const { data: [{ payment_collection }] } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "cart", fields: ["payment_collection.id"], filters: { id: cart.id },
  })
  await createPaymentSessionsWorkflow(container).run({
    input: { payment_collection_id: payment_collection!.id, provider_id: "pp_system_default" },
  })
  const { result } = await completeCartWorkflow(container).run({ input: { id: cart.id } })
  return result.id
}
