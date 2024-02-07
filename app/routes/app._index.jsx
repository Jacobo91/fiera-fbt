
import { json } from "@remix-run/node";
import { useLoaderData } from '@remix-run/react';
import shopify from "app/shopify.server";
import { Page, Card, DataTable, Button, Layout, Badge } from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
 
export async function loader({ request }) {
  const { admin } = await shopify.authenticate.admin(request);
  const response = await admin.graphql(`
  {
    discountNodes(first: 100) {
      edges {
        node {
          id
          discount {
            ... on DiscountAutomaticApp {
              title
              status
            }
          }
        }
      }
    }
  }
  `);
 
  const parsedResponse = await response.json();
 
  return json({
    discounts: parsedResponse.data?.discountNodes?.edges,
   });
 }

export async function action({ request }) {

}
 
 export default function VolumeDiscountsEdit({ params }) {
  const { discounts } = useLoaderData();
  const navigate = useNavigate();

  const handleEditClick = (discountId, discountNode) => {
    console.log(discountNode)
    const idNumber = discountId.split('/').pop();
    navigate(`/app/manage-volume-discount/${idNumber}`);
  };

  const rows = discounts.filter(discount => Object.keys(discount.node.discount).length !== 0).map((discount) => [
    discount.node.discount.title,
    <Badge tone={discount.node.discount.status == "ACTIVE" ? "success" : ""}>{discount.node.discount.status}</Badge>,
    <Button variant="plain" onClick={() => handleEditClick(discount.node.id, discount.node)} key={discount.node.id}>Edit Discount</Button>,
  ]).reverse();
 
  return (
    <div>
      <h1 style={{
        padding: "1rem",
        fontWeight: "700",
        fontSize: "1.2rem"
      }}>Frequently Bought Together Discounts</h1>
      <Card>
        <DataTable
          columnContentTypes={['text', 'text']}
          headings={['Discount Name', 'status', 'Edit']}
          rows={rows}
        />
      </Card>
    </div>
  );
}