WITH img AS (
  SELECT * FROM (VALUES
    ('essence-blazer', 1, '/images/product/essence-blazer-1.jpg'),
    ('essence-blazer', 2, '/images/product/essence-blazer-2.jpg'),
    ('essence-blazer', 3, '/images/product/essence-blazer-3.jpg'),
    ('essence-blazer', 4, '/images/product/essence-blazer-4.jpg'),
    ('essence-blazer', 5, '/images/product/essence-blazer-5.jpg'),
    ('origem-shirt', 1, '/images/product/origem-shirt-1.jpg'),
    ('origem-shirt', 2, '/images/product/origem-shirt-2.jpg'),
    ('origem-shirt', 3, '/images/product/origem-shirt-3.jpg'),
    ('origem-shirt', 4, '/images/product/origem-shirt-4.jpg'),
    ('origem-shirt', 5, '/images/product/origem-shirt-5.jpg'),
    ('genesis-bomber', 1, '/images/product/genesis-bomber-1.jpg'),
    ('genesis-bomber', 2, '/images/product/genesis-bomber-2.jpg'),
    ('genesis-bomber', 3, '/images/product/genesis-bomber-3.jpg'),
    ('genesis-bomber', 4, '/images/product/genesis-bomber-4.jpg'),
    ('genesis-bomber', 5, '/images/product/genesis-bomber-5.jpg'),
    ('noir-dress', 1, '/images/product/noir-dress-1.jpg'),
    ('noir-dress', 2, '/images/product/noir-dress-2.jpg'),
    ('noir-dress', 3, '/images/product/noir-dress-3.jpg'),
    ('noir-dress', 4, '/images/product/noir-dress-4.jpg'),
    ('noir-dress', 5, '/images/product/noir-dress-5.jpg'),
    ('atelier-bag', 1, '/images/product/atelier-bag-1.jpg'),
    ('atelier-bag', 2, '/images/product/atelier-bag-2.jpg'),
    ('atelier-bag', 3, '/images/product/atelier-bag-3.jpg'),
    ('atelier-bag', 4, '/images/product/atelier-bag-4.jpg'),
    ('atelier-bag', 5, '/images/product/atelier-bag-5.jpg'),
    ('flux-knit', 1, '/images/product/flux-knit-1.jpg'),
    ('flux-knit', 2, '/images/product/flux-knit-2.jpg'),
    ('flux-knit', 3, '/images/product/flux-knit-3.jpg'),
    ('flux-knit', 4, '/images/product/flux-knit-4.jpg'),
    ('flux-knit', 5, '/images/product/flux-knit-5.jpg'),
    ('flux-trench', 1, '/images/product/flux-trench-1.jpg'),
    ('flux-trench', 2, '/images/product/flux-trench-2.jpg'),
    ('flux-trench', 3, '/images/product/flux-trench-3.jpg'),
    ('flux-trench', 4, '/images/product/flux-trench-4.jpg'),
    ('flux-trench', 5, '/images/product/flux-trench-5.jpg'),
    ('origem-skirt', 1, '/images/product/origem-skirt-1.jpg'),
    ('origem-skirt', 2, '/images/product/origem-skirt-2.jpg'),
    ('origem-skirt', 3, '/images/product/origem-skirt-3.jpg'),
    ('origem-skirt', 4, '/images/product/origem-skirt-4.jpg'),
    ('origem-skirt', 5, '/images/product/origem-skirt-5.jpg'),
    ('noir-sneaker', 1, '/images/product/noir-sneaker-1.jpg'),
    ('noir-sneaker', 2, '/images/product/noir-sneaker-2.jpg'),
    ('noir-sneaker', 3, '/images/product/noir-sneaker-3.jpg'),
    ('noir-sneaker', 4, '/images/product/noir-sneaker-4.jpg'),
    ('noir-sneaker', 5, '/images/product/noir-sneaker-5.jpg'),
    ('essence-trousers', 1, '/images/product/essence-trousers-1.jpg'),
    ('essence-trousers', 2, '/images/product/essence-trousers-2.jpg'),
    ('essence-trousers', 3, '/images/product/essence-trousers-3.jpg'),
    ('essence-trousers', 4, '/images/product/essence-trousers-4.jpg'),
    ('essence-trousers', 5, '/images/product/essence-trousers-5.jpg'),
    ('genesis-tailored', 1, '/images/product/genesis-tailored-1.jpg'),
    ('genesis-tailored', 2, '/images/product/genesis-tailored-2.jpg'),
    ('genesis-tailored', 3, '/images/product/genesis-tailored-3.jpg'),
    ('genesis-tailored', 4, '/images/product/genesis-tailored-4.jpg'),
    ('genesis-tailored', 5, '/images/product/genesis-tailored-5.jpg'),
    ('atelier-heels', 1, '/images/product/atelier-heels-1.jpg'),
    ('atelier-heels', 2, '/images/product/atelier-heels-2.jpg'),
    ('atelier-heels', 3, '/images/product/atelier-heels-3.jpg'),
    ('atelier-heels', 4, '/images/product/atelier-heels-4.jpg'),
    ('atelier-heels', 5, '/images/product/atelier-heels-5.jpg')
  ) AS v(sku, pos, url)
), packed AS (
  SELECT sku,
         max(url) FILTER (WHERE pos = 1) AS img1,
         max(url) FILTER (WHERE pos = 2) AS img2,
         jsonb_agg(url ORDER BY pos) AS images
  FROM img
  GROUP BY sku
)
UPDATE products p
SET image_url = pk.img1,
    metadata = COALESCE(p.metadata, '{}'::jsonb)
               || jsonb_build_object('secondaryImage', pk.img2, 'images', pk.images)
FROM packed pk
WHERE p.sku = pk.sku;

SELECT sku, image_url, metadata->>'secondaryImage' AS secondary_image,
       jsonb_array_length(COALESCE(metadata->'images','[]'::jsonb)) AS images_count
FROM products
WHERE sku IN (
  'essence-blazer','origem-shirt','genesis-bomber','noir-dress','atelier-bag','flux-knit',
  'flux-trench','origem-skirt','noir-sneaker','essence-trousers','genesis-tailored','atelier-heels'
)
ORDER BY sku;
