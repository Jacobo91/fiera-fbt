# Shopify FBT App - Remix

## esta App detecta si por ejemplo el productVariant a, productVariant b y productVariant c estab en el carrito y les da un descounto, algo asi como un bundle pero que no empaqueta todas las variantes del producto a la hora de agragarlo al carrito, de tal forma que el comprador pueda eliminar alguno de ellos (obviamente esto eliminara el descuento) ya que todos deben estat para que este aplique y ademas tener la misma cantidad.

## tenemos Extensions para configurar la logica que reconoce los "bundles" y aplica el descuento y App que genera el UI para la creacion del descuento y su edicion.

## se han usado:
npm init @shopify/app@latest (para crear el template inicial con remix y js)
npm run shopify app generate extension -- --template product_discounts --name product-discount (para crear la extension)
npm install @shopify/discount-app-components @shopify/react-form @shopify/app-bridge-react

### tutorial usado como recurso: https://shopify.dev/docs/apps/selling-strategies/discounts/experience/getting-started


Primero:

- npm install

en el archivo package.json veras los comandos:

-  npm run dev para generar un preview ( configura en que tienda la quieres aplicar y la primera url te llavara a esta para su instalacion, la segunda abrira un graphQL para testear queries - si por algun motivo no funciona puedes instalar la app en tu tienda con: https://shopify-graphiql-app.shopifycloud.com/login  -)

esta app se divide en dos partes basicas:


## Extensions

1. extensions, que contiene en su folder src los archivos:

  - run.graphql que es la peticion para traer info de la DB de la cual usaremos los datos en el archivo run.js

query RunInput {
  cart {
    lines {
      quantity
      merchandise {
        __typename
        ...on ProductVariant {
            id
            product {
              metafield(namespace: "custom", key: "frequently_bought_together") {
                value
              }
            }
        }
      }
    }
  }
  discountNode {
    metafield(namespace: "volume-discount", key: "function-configuration"){
      value
    }
  }
}


traemos la informacion del carrito y discountNode que contiene un metafield el cual usaremos para configurar el descuento desde la UI mas adelante
  
  
  - run.js este archivo se encarga de detectar los bundles que se crean y aplicarles el descuento en el carrito.

  recibimos el resultado el query de run.graphQl a travez de:

  @param {RunInput} input. ( este input se usa como parametro en la funcion que se encarga de la logica)


    en esta parte el bundle que recibimos es un array 2D, con cada subarray representando un producto y dentro de este las productVariants respectivas, como por ejemplo:

  [
  [
    "gid://shopify/ProductVariant/43293721723032",
    "gid://shopify/ProductVariant/43293721755800",
    "gid://shopify/ProductVariant/43293721788568",  // este subarray es el producto complete snowboard y adentro sus ProductVariant
    "gid://shopify/ProductVariant/43293721821336",
    "gid://shopify/ProductVariant/43293721854104"
  ],
  [
    "gid://shopify/ProductVariant/43293722214552"
  ],
  [
    "gid://shopify/ProductVariant/43293722280088"
  ]
]

PD: debido a esto a la hora de editar el bundle podemos borrar o añadir y en ambos casos debemos devolver la misma estructura para que mas adelante la funcion generateCombinations nos genere los bundles posibles con los productVariant que tenemos

aqui tomamos la info del query y la usamos para detectar el bunde:

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

## App

2. la app tiene:

- components/provider/DiscountProvider.jsx esta la configuracion inicial

y en app/routes:


1. ## app._index.jsx

      esta es la UI de la applicacion en si, la cual se mostrara inicialmente en nuestro admin de shopify en nuestra app despues de instalada, esta muestra una tabala con los descuentos creados para poderlos editar ( la creacion, pausa y eliminacion de descuentos se hace a travez de la seccion discounts propia de shopify, esta UI es para editar descuentos unicamente )


2. ## app.volume-discount.$functionId.new.jsx:

      esta es la UI que se encarga de crear el descuento, la funcion action se encarga de enviar queries y la funcion volumeNew crea la UI y la logica para recopilar los datos que son almacenados en un metafield en un discountNode dentro de un discountCodeApp, los cuales son usados por la logica del archivo run.js para detecar el bundle y aplicarle el valor de descuento configurado. hay un hook form que nos permite compartir los datos recopilados con la funcion action para asi mediante el query crear el objeto en la DB.

      esta parte en la funcion volumeNew almacena:

          onSubmit: async (form) => {
      const discount = {
        title: form.discountTitle,
        method: form.discountMethod,
        code: form.discountCode,
        combinesWith: form.combinesWith,
        usageLimit: form.usageLimit == null ? null : parseInt(form.usageLimit),
        appliesOncePerCustomer: form.appliesOncePerCustomer,
        startsAt: form.startDate,
        endsAt: form.endDate,
        configuration: {
            quantity: parseInt(form.configuration.quantity),
            percentage: parseFloat(form.configuration.percentage), // porcentaje configurado en la UI
            bundles // bundle generado por la funcion generateCombinations() con la informacion recopilada con el componente resourcePicker que es agrupada en un arra 2D como vimos anteriormente y es usado de input en el primer argumento en generateCombinations()
        },
      };

      #### generateCombinations()
      const bundleCombinations = [];
      generateCombinations(argument1, 0, [], bundleCombinations);

      y luego en


3. ## app.manage-volume-discount.$discountId.jsx

esta es la parte encargada de la UI de la edicion de los descuentos creados, esta tiene:

### la funcion loader
esta funcion es la que se encarga de traer informacion de la DB mediante queries, luego esta info se usa en la funcion que crea la UI y la logica con:
const {} = useLoader().

en esta funcion traemos la configuracion del descuento que fue previamente creado:

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

  para tener un punto inicial para la edicion

  y tambien traemos los productVariants individuales con su id:

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

  usamos estos productVariants individuales y sus id para poder identificar cuando agregamos o eliminamos que products variants deben ser agrupadas en el mismo array y cuales no para asi poder reflejar nuestra estructura de array 2D necesaria para que el run.js pueda identificar los bundles, de esta manera usando el productId traido en el query de todos los productVariant del bundle y usando el product id que conseguinmos del resources que devuelve el resourcePicker: resources.selection donde vemos todas las variantes elegidoas en resources.selection[i].variants y el id de este producto en resources.selection[i].id logramos asociar las productVariants a un productId y asi saber como agruparlas correctamente en nuestro array 2D.

  el state innerVariants es el encargado de lo que se renderiza en el UI, para que podamos ver las Cards de los productVariant agregados o que desaparezcan las eliminadas.

  el campo del descuento edit la cantidad porcentual de descuento que queremos cambiar

  ### la funcion action
  envia lo recopilado de la edicion a la DB usando una mutacion para actualizar nuestro descuento especifico y su informacion es recopilada con el form hook.

  ## la funcion EditDiscount

  esta genera la UI y maneja la logica para borrar o agregar productVariants a travez de estas dos fuciones:

  ### Agrega
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
  
  ### quita

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

  ### const [innerVariants, setInnerVariants] = useState(() => [...variants]);
            ⬇️
Este state se encarga de los variants que se renderizaran en la UI





# fiera-fbt
