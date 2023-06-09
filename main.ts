import { PDFDocumentProxy, getDocument } from "pdfjs-dist";
import type {
  TextItem,
  TextMarkedContent,
} from "pdfjs-dist/types/src/display/api";
import * as fs from "fs";
import * as path from "path";
import { CLIENT_PREFIX, DATE_PREFIX } from "./constants";
import { Order } from "./types";
import { CATEGORY_MAP, FOLDER_PATH, RENAME_PDFS } from "./masterList";
import { Parser } from "@json2csv/plainjs";

const writeToFile = (filePath: string, data: any) => {
  if (typeof data === "string") {
    fs.writeFile(filePath, data, (err) => {});
  } else {
    fs.writeFile(filePath, JSON.stringify(data, null, 2), (err) => {});
  }
};

const isTextItem = (item: TextItem | TextMarkedContent): item is TextItem => {
  return "str" in item;
};

const filterLineByNonEmpty = (line: string[]): string[] =>
  line.filter((item) => item != "" && item != " ");

const mergeUnits = (quantities: string[]): string[] => {
  const unitMap: Record<string, number> = {};
  for (const quantity of quantities) {
    const num = Number(quantity.split(" ")[0]);
    const unit = quantity.split(" ")[1].toLowerCase().trim();
    if (unit in unitMap) {
      unitMap[unit] += num;
    } else {
      unitMap[unit] = num;
    }
  }
  const output = [];
  for (const [unit, num] of Object.entries(unitMap)) {
    output.push(`${num} ${unit}`);
  }
  return output;
};

const getAllPageContent = async (
  pdf: PDFDocumentProxy
): Promise<(TextItem | TextMarkedContent)[]> => {
  const allContent: (TextItem | TextMarkedContent)[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    allContent.push(...content.items);
  }
  return allContent;
};

const getCategory = (item: string): string | null => {
  if (item.startsWith("frz")) {
    return "frozen";
  }
  for (const [category, items] of Object.entries(CATEGORY_MAP)) {
    for (const currentItem of items) {
      if (typeof currentItem === "string") {
        if (
          item.toLowerCase().trim().includes(currentItem.toLowerCase().trim())
        ) {
          return category.toLowerCase().trim();
        }
      } else if (currentItem.test(item)) {
        return category.toLowerCase().trim();
      }
    }
  }
  return null;
};

const parseDateLine = (line: string[], pdfPath: string): string => {
  if (line.length != 1 || !line[0].startsWith(DATE_PREFIX)) {
    throw Error(`Unable to find date for ${pdfPath}`);
  }
  return line[0].replace(DATE_PREFIX, "");
};

const parseClientLine = (line: string[], pdfPath: string): string => {
  const filteredLine = filterLineByNonEmpty(line);
  if (filteredLine.length != 1 || !filteredLine[0].startsWith(CLIENT_PREFIX)) {
    throw Error(`Unable to find client for ${pdfPath}`);
  }

  return filteredLine[0].replace(CLIENT_PREFIX, "");
};

const handleFinalOrderList = (allOrders: Order[]) => {
  const finalOrderList = Array.from(
    new Set(allOrders.map((order) => order.client.toUpperCase()))
  ).map((client, number) => ({ number: number + 1, client }));
  const finalOrderFilePath = `output/${FOLDER_PATH}/finalOrderList.csv`;
  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(finalOrderList);

  writeToFile(finalOrderFilePath, csv);
};

const handleFreshList = (allOrders: Order[]) => {
  const freshList = allOrders.reduce(
    (groups: Record<string, Record<string, string[]>>, current) => {
      if (!current.category || current.category === "frozen") {
        return groups;
      }
      const freshCategoryKey = current.category.toLowerCase();
      const productKey = current.product.toLowerCase().trim();

      if (groups[freshCategoryKey]) {
        if (groups[freshCategoryKey][productKey]) {
          groups[freshCategoryKey][productKey].push(current.quantity);
        } else {
          groups[freshCategoryKey][productKey] = [current.quantity];
        }
      } else {
        groups[freshCategoryKey] = { [productKey]: [current.quantity] };
      }
      return groups;
    },
    {}
  );

  const outputArray = [];

  for (const category in freshList) {
    for (const product in freshList[category]) {
      const quantity = freshList[category][product].join(", ");
      outputArray.push({
        category,
        product,
        quantity,
      });
    }
  }
  const sortedResult = outputArray.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.product.localeCompare(b.product);
  });
  const freshListFilePath = `output/${FOLDER_PATH}/freshList.csv`;

  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(sortedResult);

  writeToFile(freshListFilePath, csv);
};

const handleFrozenListPerClient = (allOrders: Order[]) => {
  const frozenListPerClient = allOrders
    .filter((order) => order.category === "frozen")
    .map((order) => ({
      client: order.client,
      product: order.product,
      quantity: order.quantity,
    }))
    .sort((a, b) => {
      if (a.client !== b.client) {
        return a.client.localeCompare(b.client);
      }
      return a.product.localeCompare(b.product);
    });

  const frozenListFilePath = `output/${FOLDER_PATH}/frozenListPerClient.csv`;
  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(frozenListPerClient);
  writeToFile(frozenListFilePath, csv);
};

const handleFrozenListPerProduct = (allOrders: Order[]) => {
  const frozenListPerProduct = allOrders.reduce(
    (groups: Record<string, string[]>, current) => {
      if (!current.category || current.category !== "frozen") {
        return groups;
      }
      const productKey = current.product;
      if (groups[productKey]) {
        groups[productKey].push(current.quantity);
      } else {
        groups[productKey] = [current.quantity];
      }
      return groups;
    },
    {}
  );
  const result = Object.entries(frozenListPerProduct)
    .map(([product, quantities]) => ({
      product,
      quantity: mergeUnits(quantities).join(","),
    }))
    .sort((a, b) => a.product.localeCompare(b.product));
  const frozenListPerProductFilePath = `output/${FOLDER_PATH}/frozenListPerProduct.csv`;
  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(result);
  writeToFile(frozenListPerProductFilePath, csv);
};

const handleUncategorizedItems = (allOrders: Order[]) => {
  const uncategorized = allOrders.filter((order) => order.category == null);
  const uncategorizedFilePath = `output/${FOLDER_PATH}/uncategorized.csv`;

  if (uncategorized.length > 0) {
    const json2csvParser = new Parser();
    const csv = json2csvParser.parse(uncategorized);
    writeToFile(uncategorizedFilePath, csv);
  } else {
    writeToFile(uncategorizedFilePath, "");
  }
};

// Parse the PDF
const parsePDF = async (pdfPath: string): Promise<Order[]> => {
  const pdf = await getDocument(pdfPath).promise;
  const allContent = await getAllPageContent(pdf);
  const filteredItems = allContent.filter((item) =>
    isTextItem(item)
  ) as TextItem[];
  const lines = filteredItems.reduce(
    (groups: Record<number, Array<string>>, current) => {
      const key = current.transform[5];
      if (groups[key]) {
        groups[key].push(current.str);
      } else {
        groups[key] = [current.str];
      }
      return groups;
    },
    {}
  );
  const filteredLines = Object.entries(lines)
    .sort(([keyA], [keyB]) => parseFloat(keyB) - parseFloat(keyA))
    .map((item) => item[1]);
  const date = parseDateLine(filteredLines[0], pdfPath);
  const client = parseClientLine(filteredLines[1], pdfPath);
  // order lines should have at least 4 items
  const orderLines = filteredLines.slice(3).filter((line) => line.length >= 4);
  const orders = orderLines.map((order) => {
    let product = order[3].toLowerCase().trim();
    let quantity = order[1];
    const category = getCategory(product);

    if (category?.includes("customer")) {
      quantity = `${quantity} / ${client}`;
    }

    return {
      date,
      client,
      quantity,
      product,
      category,
    };
  });
  const parsedInfo = {
    client,
    date,
    orders,
  };
  const pdfFileName = pdfPath
    .replace(`input/${FOLDER_PATH}/`, "")
    .replace(".pdf", "");
  const outputPdfFilePath = `output/${FOLDER_PATH}/orders/${
    RENAME_PDFS ? client : pdfFileName
  }.csv`;
  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(orders);
  writeToFile(outputPdfFilePath, csv);

  if (RENAME_PDFS) {
    const newPath = pdfPath.replace(pdfFileName, client);
    fs.renameSync(pdfPath, newPath);
  }

  return orders;
};

// don't add for fresh,
// add for frozen
// if a product has {FRZ} in front of it, then it's included in frozen
const parseAllPDFs = async (): Promise<void> => {
  const inputPath = `input/${FOLDER_PATH}`;
  const files = fs.readdirSync(inputPath);
  console.log(`Parsing ${FOLDER_PATH}. Found ${files.length} orders`);
  const pdfFiles: string[] = [];

  const allOrders: Order[] = [];
  for (const file of files) {
    const filePath = path.join(inputPath, file);
    const fileExtension = path.extname(file);

    if (fs.statSync(filePath).isFile() && fileExtension === ".pdf") {
      pdfFiles.push(`${inputPath}/${file}`);
    }
  }

  for (const pdfFile of pdfFiles) {
    const orders = await parsePDF(pdfFile);
    allOrders.push(...orders);
  }

  if (new Set(allOrders.map((order) => order.date)).size != 1) {
    console.warn(
      "didn't get only one date",
      new Set(allOrders.map((order) => order.date))
    );
  }

  if (
    allOrders
      .map((order) => order.category)
      .some((category) => category == null)
  ) {
    {
      console.warn("some orders have null categories");
    }
  }

  const outputFolderPath = `output/${FOLDER_PATH}/orders`;
  if (!fs.existsSync(outputFolderPath)) {
    fs.mkdirSync(outputFolderPath, { recursive: true });
  }

  handleFinalOrderList(allOrders);

  handleFreshList(allOrders);

  handleFrozenListPerClient(allOrders);

  handleFrozenListPerProduct(allOrders);

  handleUncategorizedItems(allOrders);

  console.log("all finished!");
};

// Call the parsing function
parseAllPDFs().catch((error) => console.error(error));
