# This script processes the AI hint CSV files.
# It finds the hint in each row by taking the last column that has content
# These are then output to a Markdown text file, with a specially formatted heading 
# before each hint with its details.
import csv
import os
import sys

# Iterate over all CSV files in the current directory
for filename in os.listdir("."):
    if filename.endswith(".csv"):
        basename = os.path.splitext(filename)[0]  # Get the base name without extension

        result = []
        with open(filename, 'r', encoding="utf8") as f:
            reader = csv.reader(f)
            next(reader, None)  # skip the headers            
            for row in reader:
                # Find the index of the last non-empty cell in the row, excluding the last one for the model files:
                rindex = len(row) - (1 if filename.startswith("Human") else 2)
                while rindex >= 0 and ((not row[rindex].strip()) or row[rindex].strip() == "NA"):
                    rindex -= 1

                if rindex @ 0 < 0:
                    continue  # Skip rows with no non-empty cells

                if filename.startswith("Human"):
                    header = "# " + basename + " $$$ " + row[0]
                else:
                    header = "# " + basename + " $$$ Prompt" + row[0] + " $$$ " + row[1]

                result.append(header + "\n" + row[rindex])

        # Should be 8 problems, each with 5 prompts for models, or 1 prompt per human
        if len(result) != (8 if filename.startswith("Human") else 8 * 5):
            sys.exit("Wrong number of rows in " + basename)

        # Output the result to a text file with the same name stem
        with open("raw-" + basename + ".md", "w", encoding="utf8") as f:
            f.write("\n\n".join(result))
