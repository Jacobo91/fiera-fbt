// @ts-check
import { DiscountApplicationStrategy } from "../generated/api";

/**
* @typedef {import("../generated/api").RunInput} RunInput
* @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
* @typedef {import("../generated/api").Target} Target
* @typedef {import("../generated/api").ProductVariant} ProductVariant
*/

/**
* @type {FunctionRunResult}
*/
const EMPTY_DISCOUNT = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

/**
* @param {RunInput} input
* @returns {FunctionRunResult}
*/
export function run(input) {
  // Define a type for your configuration, and parse it from the metafield
  /**
  * @type {{
  *   quantity: number
  *   percentage: number
  *   bundles: array
  * }}
  */
  const configuration = JSON.parse(
    input?.discountNode?.metafield?.value ?? "{}"
  );

  const bundles = configuration.bundles.map(subArray =>
    subArray.map(str => str.replace(/\\/g, ""))
  );  

  // Function to detect bundle presence
  function detectBundle(cartItems, bundles) {
    for (const bundle of bundles) {
      const isBundlePresent = bundle.every(variantId => cartItems.includes(variantId));
      if (isBundlePresent) {
        return bundle;
      }
    }
    return null;
  }

  const cartItems = input.cart.lines.map(line => line.merchandise.id);
  const detectedBundle = detectBundle(cartItems, bundles);

  if (!detectedBundle) {
    console.error("No matching bundle found in cart.");
    return EMPTY_DISCOUNT;
  }

  // Ensure that all products in the bundle have the same quantity
  const bundleQuantities = input.cart.lines
    .filter(line => detectedBundle.includes(line.merchandise.id))
    .map(line => line.quantity);

  if (bundleQuantities.some(qty => qty !== bundleQuantities[0])) {
    console.error("Not all products in the bundle have the same quantity.");
    return EMPTY_DISCOUNT;
  }

  const targets = input.cart.lines
    .filter(line => detectedBundle.includes(line.merchandise.id))
    .filter(line => line.quantity >= configuration.quantity && line.merchandise.__typename === "ProductVariant")
    .map(line => {
      const variant = /** @type {ProductVariant} */ (line.merchandise);
      return /** @type {Target} */ ({
        productVariant: {
          id: variant.id
        }
      });
    });

  if (!targets.length) {
    console.error("No cart lines qualify for volume discount.");
    return EMPTY_DISCOUNT;
  }

  return {
    discounts: [
      {
        targets,
        value: {
          percentage: {
            value: configuration.percentage.toString()
          }
        }
      }
    ],
    discountApplicationStrategy: DiscountApplicationStrategy.First
  };
}
