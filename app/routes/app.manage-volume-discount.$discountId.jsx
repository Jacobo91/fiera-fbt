import { useEffect, useMemo, useState } from "react";
import { useLoaderData } from '@remix-run/react';
import { json } from "@remix-run/node";
import { useForm, useField } from "@shopify/react-form";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge/actions";
import { CurrencyCode } from "@shopify/react-i18n";
import {
  Form,
  useActionData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  DiscountMethod,
  RequirementType,
  onBreadcrumbAction,
} from "@shopify/discount-app-components";
import {
  Banner,
  Card,
  Text,
  Layout,
  Page,
  PageActions,
  TextField,
  BlockStack,
  Button,
  Thumbnail,
  Icon
} from "@shopify/polaris";

import shopify from "../shopify.server";
import { ResourcePicker } from '@shopify/app-bridge-react';
import { useNavigate } from 'react-router-dom';



export async function loader({ params, request }) {
  const { discountId } = params;
  const { admin } = await shopify.authenticate.admin(request);
  const discountCodeId = `gid://shopify/DiscountAutomaticNode/${discountId}`;
  const response = await admin.graphql(`
  {
    discountNode(id: "${discountCodeId}") {
      id
      metafield(namespace: "volume-discount", key:"function-configuration"){
        id
        value
      }
      discount {
        ... on DiscountAutomaticApp {
          title
        }
      }
    }
  }
  `);
 
  const parsedResponse = await response.json();

  const {
    discountNode: {
      id,
      metafield: {
        value: metafieldValue,
      }
    },
  } = parsedResponse.data;

  const productVariants = [...new Set(JSON.parse(metafieldValue).bundles.flat())];
  const query = `
  query {
    ${productVariants.map((variantId, index) => `
      productVariant${index + 1}: productVariant(id: "${variantId}") {
        image {
          url
        }
        displayName
        id
        product {
          id
          featuredImage {
            url
          }
        }
      }
    `).join('\n')}
  }`;
  const variantResponse = await admin.graphql(query);
  const parsedVariantResponse = await variantResponse.json()
  

  return json({
    discount: parsedResponse.data,
    variants: Object.values(parsedVariantResponse.data),
   })
 };

 export async function action({ params, request }) {
  const { discountId } = params;
  const { admin } = await shopify.authenticate.admin(request);
  const formData = await request?.formData();

  const {
    configuration,
  } = JSON.parse(formData.get("discount"));

  const response = await admin.graphql(
    `mutation UpdateAutomaticDiscount($automaticAppDiscount: DiscountAutomaticAppInput!, $id: ID!) {
      discountAutomaticAppUpdate(automaticAppDiscount: $automaticAppDiscount, id: $id) {
        userErrors {
          field
          message
        }
      }
    }
    `,
    {
      variables: {
        id: `gid://shopify/DiscountAutomaticNode/${discountId}`,
        automaticAppDiscount: {
          metafields: [
            {
              id: configuration.metafieldId,
              namespace: "volume-discount",
              key: "function-configuration",
              type: "json",
              value: JSON.stringify({
                quantity: configuration.quantity,
                percentage: configuration.percentage,
                bundles: configuration.bundles
              }),
            },
          ],
        },
      },
    }
  );

  const data = await response.json();
  const updateErrors = data.data.discountAutomaticAppUpdate?.userErrors;
  return json({ errors: updateErrors });
}



export default function EditDiscount() {
  const { discount, variants } = useLoaderData();

  const [isBrowse, setIsBrowse] = useState(false);
  // inner variants is what the UI uses to show product cards 
  const [innerVariants, setInnerVariants] = useState(() => [...variants]);
  const [productVariantGroups, setProductVariantGroups] = useState(() => {
    const result = {};

    variants.forEach((item) => {
      const productId = item.product.id;

      if (!result[productId]) {
        result[productId] = [];
      }

      result[productId].push(item.id);
    });

    const arrayOfSubarrays = Object.values(result);
    return arrayOfSubarrays
  });

  console.log("Variants:", variants)
  
  const submitForm = useSubmit();
  const actionData = useActionData();
  const navigation = useNavigation();
  const app = useAppBridge();
  const todaysDate = useMemo(() => new Date(), []);
  const navigate = useNavigate();
  const isLoading = navigation.state === 'submitting';
  const currencyCode = CurrencyCode.Cad;
  const submitErrors = actionData?.errors || [];
  const redirect = Redirect.create(app);

  const {
    discountNode: {
      id,
      metafield: { value: metafieldValue, id: metafieldId },
      discount: { title: theDiscountTitle },
    },
  } = discount;

  //const [bundles, setBundles] = useState(() => { return JSON.parse(metafieldValue).bundles });
  const [newBundles, setNewBundles] = useState([]);
  const metafieldValueObject = JSON.parse(metafieldValue);
  const currentDiscountPercentage = metafieldValueObject.percentage.toString();

  useEffect(() => {
    if (actionData?.errors.length === 0) {
      redirect.dispatch(Redirect.Action.ADMIN_SECTION, {
        name: Redirect.ResourceType.Discount,
      });
    }
  }, [actionData]);

  const {
    fields: {
      configuration,
    },
    submit,
  } = useForm({
    fields: {
      discountTitle: useField(''),
      discountMethod: useField(DiscountMethod.Code),
      discountCode: useField(''),
      combinesWith: useField({
        orderDiscounts: false,
        productDiscounts: false,
        shippingDiscounts: false,
      }),
      requirementType: useField(RequirementType.None),
      requirementSubtotal: useField('0'),
      requirementQuantity: useField('0'),
      usageLimit: useField(null),
      appliesOncePerCustomer: useField(false),
      startDate: useField(todaysDate),
      endDate: useField(null),
      configuration: {
        quantity: useField('1'),
        percentage: useField(currentDiscountPercentage),
      },
    },
    onSubmit: async (form) => {
      const discount = {
        configuration: {
          quantity: parseInt(form.configuration.quantity),
          percentage: parseFloat(form.configuration.percentage),
          bundles: newBundles,
          metafieldId
        },
      };
      console.log({ discount: JSON.stringify(discount) })
      submitForm({ discount: JSON.stringify(discount) }, { method: 'post' });

      return { status: 'success' };
    },
  });

  const errorBanner =
    submitErrors.length > 0 ? (
      <Layout.Section>
        <Banner status="critical">
          <p>There were some issues with your form submission:</p>
          <ul>
            {submitErrors.map(({ message, field }, index) => (
              <li key={`${message}${index}`}>
                {field.join('.')} {message}
              </li>
            ))}
          </ul>
        </Banner>
      </Layout.Section>
    ) : null;

  const handleProductSelection = () => {
    setIsBrowse((prev) => !prev);
  };

  function generateCombinations(
    bundleVariants,
    index = 0,
    currentCombination = [],
    result = []
  ) {
    if (index === bundleVariants.length) {
      result.push([...currentCombination]);
      return;
    }

    for (const variant of bundleVariants[index]) {
      currentCombination.push(variant);
      generateCombinations(
        bundleVariants,
        index + 1,
        currentCombination,
        result
      );
      currentCombination.pop();
    }
  }

  const hendleResourcesSelection = (resources) => {
    console.log(resources);
    setIsBrowse((prev) => !prev);
  
    const newBundleVariants = resources.selection.map((selection) =>
    selection.variants.map((variant) => variant.id)
    );


    const newVariants = resources.selection.map((item) => {
      const variants = item.variants.map((variant) => {
        // give the variant its product image in case it doesnt have and create productId property for grouping purposes
        variant.image = { url: item.images[0].originalSrc }
        variant.productId = item.id
        return variant;
      });
      return variants;
    }).flat();

    const updatedVariants = [...variants, ...newVariants]

    console.log("Updated Variants after Addition:", updatedVariants);

    const result = {};

    updatedVariants.forEach((item) => {
      const productId = item.product.id ? item.product.id : item.productId;

      if (!result[productId]) {
        result[productId] = [];
      }

      result[productId].push(item.id);
    });

    const arrayOfSubarrays = Object.values(result);
  
    setInnerVariants((prevInnerVariants) => [...prevInnerVariants, ...newVariants]);

    setProductVariantGroups((prevProductVariantGroups) => [...prevProductVariantGroups, ...newBundleVariants]);
    const bundleCombinations = [];
    generateCombinations(arrayOfSubarrays, 0, [], bundleCombinations);
    setNewBundles(bundleCombinations);
  };
  
  const onDelete = (variantId) => {
    console.log(variantId);

    // Update innerVariants state
    const updatedInnerVariants = innerVariants.filter(
      (variant) => variant.id !== variantId
    );
    setInnerVariants(updatedInnerVariants);

    const updatedProductVariantGroups = productVariantGroups
    .map((group) => group.filter((id) => id !== variantId))
    .filter((group) => group.length > 0);

    console.log("After Deleting a Product Variant:", updatedProductVariantGroups)
    
    setProductVariantGroups(updatedProductVariantGroups)

    const bundleCombinations = [];
    generateCombinations(updatedProductVariantGroups, 0, [], bundleCombinations);
    console.log("Recalculated bundles after Deletion:", bundleCombinations)
    setNewBundles(bundleCombinations);
  };

  return (
    <Page
      title="Edit discount"
      backAction={{
        content: 'Discounts',
        onAction: () => navigate('/app'),
      }}
      primaryAction={{
        content: 'Save',
        onAction: submit,
        loading: isLoading,
      }}
    >
      <Text variant="headingMd" as="h6">
        {theDiscountTitle}
      </Text>
      <Layout>
        {errorBanner}
        <Layout.Section>
          <Form method="post">
            <BlockStack align="space-around" gap="2">
              <Card>
                <BlockStack gap="3">
                  <Text variant="headingMd" as="h2">
                    Edit discount percentage
                  </Text>
                  <TextField
                    label="Discount percentage"
                    autoComplete="on"
                    {...configuration.percentage}
                    suffix="%"
                  />
                </BlockStack>
              </Card>
              <Card>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                  }}
                >
                  <Text variant="headingMd" as="h2">
                    Current Products
                  </Text>
                  <Button onClick={handleProductSelection}>Browse</Button>
                  {isBrowse && (
                    <ResourcePicker
                      resourceType="Product"
                      open
                      onSelection={(resources) =>
                        hendleResourcesSelection(resources)
                      }
                    />
                  )}
                </div>
                {innerVariants &&
                  innerVariants.map((variant, index) => (
                    <Card key={index}>
                      <div
                        style={{
                          display: 'flex',
                          gap: '1rem',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <Thumbnail
                            source={variant.image?.url ? variant.image?.url : variant.product?.featuredImage?.url}
                            alt={variant.displayName}
                          />
                          <Text variant="headingMd" as="h6">
                            {variant.displayName}
                          </Text>
                        </div>
                        <div>
                          <Button
                            variant="primary"
                            tone="critical"
                            onClick={() => onDelete(variant.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
              </Card>
            </BlockStack>
          </Form>
        </Layout.Section>
        <Layout.Section secondary>{/* SummaryCard goes here */}</Layout.Section>
        <Layout.Section>
          <PageActions
            primaryAction={{
              content: 'Save discount',
              onAction: submit,
              loading: isLoading,
            }}
            secondaryActions={[
              {
                content: 'Discard',
                onAction: () => onBreadcrumbAction(redirect, true),
              },
            ]}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}



