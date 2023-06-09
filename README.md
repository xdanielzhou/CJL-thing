# How to use

1. Create a new folder in the `input` folder, preferably dated and formatted like `5_10_2023`.
2. Add all the order PDFs to your new folder.
3. Open `masterList.ts`, and change the `FOLDER_PATH` variable to your new folder name.
4. Run `npx ts-node main.ts` in your terminal.
5. Open `output/orders`. Each file in there should match the name of a pdf. Go through each file and verify the information matches the information in the respective pdf. Also make sure that each order's `category` is not `null`.
6. Open `output/<new_folder_name>/uncategorized.csv`. Make sure there are no orders there.
7. If any order is missing a `category`, open `masterList.ts` and just add the product name inside the list of that category.

# masterList.ts

- `FOLDER_PATH`: The input file name. All orders for this day should be placed in this file.
- `RENAME_PDFS`: If `true`, all pdf names will be renamed to the client name. Otherwise, the file name will be unchanged
- `CATEGORY_MAP`. This is a mapping from the category name to the list of products that are in that category. To add a new product to a category, find the end of the list (the last item inside the []), and add the product to the end. When actually checking for a match, the case won't matter, but the plurality will matter (shrimps vs shrimp).
