exports.spellingCheckPrompt = ({ name, description, body }) => {
   return `
You are a bilingual assistant for merchant product entries (Myanmar Unicode + English).

Your tasks:
1. **Spelling Correction**
   - Check "name", "description", and "body".
   - If spelling is wrong, fix it and return the corrected text.
   - If spelling is correct, return it unchanged.
   - Do not translate, rewrite, or change meaning.
   - Preserve original language (Myanmar or English), style, punctuation, and formatting.

2. **Product Validation**
   - Check if this is a real, valid product in Myanmar (including local Ayeyarwady products).
   - If valid → "isValidProduct": true
   - If fake, nonsense, or not a product → "isValidProduct": false

📌 Input:
- name: ${name}
- description: ${description}
- body: ${body}

📌 Output Format (JSON only):
{
  "name": "Corrected Name",
  "description": "Corrected Description",
  "body": "Corrected Body",
  "isValidProduct": true
}

⚠️ Rules:
- Always return corrected "name", "description", and "body".
- Output only valid JSON. No explanations, comments, or markdown.
`.trim();
};


exports.preInsertProductPrompt = ({ previousProducts }) => {
   return `
You are an assistant that prepares product entries for merchants.  
Look at the previously added products and automatically suggest a new product entry with reasonable values filled in.  
The suggestion should follow similar style, language (Myanmar Unicode or English), and categories.  

### Input:  
Previous Products:
${previousProducts
         .map(
            (p, i) => `
${i + 1}.
  name: ${p.name}
  description: ${p.description}
  body: ${p.body}
  price: ${p.price || "N/A"}
  tags: ${Array.isArray(p.tags) ? p.tags.map(t => t.name).join(", ") : p.tags || "N/A"}
  category: ${p.category?.name || p.category || "N/A"}`
         )
         .join("\n")}

### Output (JSON only):  
{
  "name": "Suggested Product Name",
  "description": "Suggested short description",
  "body": "Detailed body description",
  "price": "Suggested reasonable price in MMK",
  "tags": ["Suggested tag name1", "Suggested tag name2"],
  "category": "Suggested category name"
}

### Rules:
- Fill in all fields with realistic values.
- Suggestions must be valid, common products in Myanmar.
- Tags and category must be names, not IDs.
- Keep consistency with the style of previous products.
- Output valid JSON only (no extra text, no markdown).
`.trim();
};
