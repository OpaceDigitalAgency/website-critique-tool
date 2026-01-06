# ZIP Upload Guide - Opace Annotate

## 🎯 New Feature: ZIP File Upload with Drag & Drop

You can now upload your entire website as a ZIP file, including all HTML, CSS, JavaScript, and images!

---

## 📦 How to Prepare Your ZIP File

### For Your Betco Website:

1. Navigate to your website folder:
   ```
   /Users/davidbryan/Dropbox/Opace-Dave-Donnelly/Betco/new website/
   ```

2. **Option A: Create ZIP on Mac**
   - Right-click on the `new website` folder
   - Select "Compress 'new website'"
   - This creates `new website.zip`

3. **Option B: Use Terminal**
   ```bash
   cd "/Users/davidbryan/Dropbox/Opace-Dave-Donnelly/Betco"
   zip -r betco-website.zip "new website"
   ```

### What Gets Included:

The app will automatically extract and use:
- ✅ **HTML files** (.html) - Your pages
- ✅ **CSS files** (.css) - Stylesheets
- ✅ **JavaScript files** (.js) - Scripts
- ✅ **Images** (.jpg, .jpeg, .png, .gif, .svg, .webp, .ico)

All assets are converted to data URLs and embedded directly, so everything works **completely offline**!

---

## 🚀 How to Upload

### Method 1: Drag & Drop (Easiest!)

1. Open http://localhost:3000
2. You'll see a large blue dashed box at the top
3. **Drag your ZIP file** onto this box
4. Drop it!
5. The app will automatically:
   - Extract all files
   - Find all HTML pages
   - Embed all CSS, JS, and images
   - Open the project creation modal

### Method 2: Click to Browse

1. Open http://localhost:3000
2. Click anywhere on the blue dashed box
3. Browse to your ZIP file
4. Select it
5. Same automatic process as drag & drop

### Method 3: Traditional Upload (Still Available)

- Click "Upload HTML Files" button
- Select individual files or folders
- Works the same as before

---

## 📋 After Upload

Once you drop/select your ZIP file:

1. A modal will appear with project details
2. Fill in:
   - **Project Name**: e.g., "Betco Fasteners Website"
   - **Client Name**: e.g., "Betco"
   - **Description**: e.g., "New website design mockups"
3. You'll see: "X HTML file(s) selected"
4. Click **"Create Project"**
5. Your project opens with all pages ready to review!

---

## 🎨 What Happens Behind the Scenes

### Asset Embedding Process:

1. **ZIP Extraction**: JSZip library extracts all files
2. **HTML Detection**: Finds all .html files for pages
3. **Asset Conversion**: Converts CSS, JS, images to data URLs
4. **Path Resolution**: Automatically fixes relative paths like:
   - `./style.css` → embedded data URL
   - `../images/logo.png` → embedded data URL
   - `betco-styles.css` → embedded data URL
5. **Storage**: Everything saved to browser LocalStorage

### Benefits:

- ✅ **Works 100% offline** - No server needed
- ✅ **No broken links** - All assets embedded
- ✅ **Fast loading** - Everything in memory
- ✅ **Privacy** - Nothing uploaded to cloud
- ✅ **Portable** - Works on any computer

---

## 📁 Supported File Structure

Your ZIP can have any structure:

```
betco-website.zip
├── homepage.html
├── about.html
├── product.html
├── betco-styles.css
├── main.js
├── images/
│   ├── logo.jpg
│   ├── hero-banner.jpg
│   └── product.png
└── scripts/
    └── counter.js
```

Or nested:

```
website.zip
└── new website/
    ├── index.html
    ├── css/
    │   └── style.css
    ├── js/
    │   └── main.js
    └── images/
        └── *.jpg
```

**Both work perfectly!** The app handles any folder structure.

---

## 🔍 Troubleshooting

### "No HTML files found"

- Make sure your ZIP contains .html files
- Check the files aren't in a deeply nested folder
- Try extracting the ZIP first to verify contents

### "Images not showing"

- Supported formats: .jpg, .jpeg, .png, .gif, .svg, .webp, .ico
- Check image paths in your HTML match the ZIP structure
- The app tries multiple path variations automatically

### "CSS not applied"

- Make sure CSS files are in the ZIP
- Check `<link>` tags in HTML point to correct paths
- The app converts relative paths automatically

### "ZIP too large"

- Browser LocalStorage has limits (~5-10MB typically)
- For very large sites, consider:
  - Optimising images
  - Removing unused assets
  - Splitting into multiple projects

---

## 💡 Tips for Best Results

### Before Creating ZIP:

1. **Test locally first** - Make sure your HTML files work
2. **Use relative paths** - Avoid absolute URLs for local assets
3. **Optimise images** - Compress large images
4. **Clean up** - Remove node_modules, .git, etc.

### Recommended ZIP Contents:

```
✅ Include:
- All .html files
- All .css files
- All .js files
- All images
- Fonts (if used)

❌ Exclude:
- node_modules/
- .git/
- .DS_Store
- Source files (.psd, .ai, .sketch)
- Documentation
```

---

## 🎯 Quick Start for Betco Website

**Fastest way to get your Betco mockups into the app:**

1. **Create ZIP**:
   ```bash
   cd "/Users/davidbryan/Dropbox/Opace-Dave-Donnelly/Betco"
   zip -r betco-mockups.zip "new website" -x "*/node_modules/*" -x "*/.git/*"
   ```

2. **Open app**: http://localhost:3000

3. **Drag & drop** the ZIP file onto the blue box

4. **Fill in details**:
   - Name: "Betco Fasteners Website"
   - Client: "Betco"

5. **Click "Create Project"**

6. **Start reviewing!** All 6 pages ready with all images and styles

---

## 🌐 Works Completely Locally

**Important**: Everything runs in your browser!

- ✅ No files uploaded to any server
- ✅ No internet connection required (after initial load)
- ✅ All data in browser LocalStorage
- ✅ Complete privacy
- ✅ Fast and responsive

---

## 📊 File Size Limits

Browser LocalStorage limits vary:

- **Chrome/Edge**: ~10MB
- **Firefox**: ~10MB
- **Safari**: ~5MB

For larger sites, the app will warn you if storage is full.

---

**Your Betco website is ready to upload! Just create a ZIP and drag it in.** 🎉

