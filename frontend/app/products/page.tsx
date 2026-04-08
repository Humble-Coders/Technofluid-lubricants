import fs from "fs";
import path from "path";

interface IndustryProduct {
  name: string;
  products: string[];
}

interface ProductsData {
  industries: IndustryProduct[];
}

// Read products.json at build time
function getProducts(): IndustryProduct[] {
  const filePath = path.join(process.cwd(), "app", "products.json");
  const data = fs.readFileSync(filePath, "utf-8");
  const parsedData = JSON.parse(data) as ProductsData;
  return parsedData.industries;
}

export default function ProductsPage() {
  const products = getProducts();

  return (
    <main className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8 text-center">Industry Products</h1>
      <div className="space-y-8">
        {products.map((industry) => (
          <section
            key={industry.name}
            className="bg-white rounded-lg shadow p-6"
          >
            <h2 className="text-xl font-semibold mb-4">{industry.name}</h2>
            <ul className="list-disc list-inside grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2">
              {industry.products.map((product) => (
                <li key={product} className="text-gray-700">
                  {product}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
