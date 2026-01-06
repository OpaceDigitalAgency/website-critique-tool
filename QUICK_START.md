# Quick Start Guide - Opace Annotate

## 🚀 Getting Started

The application is now running at **http://localhost:3000**

## 📁 Loading Your Betco Mockups

You have two options to load your existing Betco website mockups:

### Option 1: Upload HTML Files (Recommended for Local Files)

1. Click **"Upload HTML Files"** on the dashboard
2. Fill in the project details:
   - **Project Name**: "Betco Fasteners Website"
   - **Client Name**: "Betco"
   - **Description**: "New website design mockups"
3. Click **"Select HTML Files"**
4. Navigate to: `/Users/davidbryan/Dropbox/Opace-Dave-Donnelly/Betco/new website/`
5. Select the folder or individual HTML files:
   - homepage.html
   - about.html
   - category.html
   - contact.html
   - faq.html
   - product.html
6. Click **"Create Project"**

### Option 2: Use URL (If Hosted)

If you've deployed the mockups to a staging server:

1. Click **"Add Website URL"**
2. Enter the staging URL
3. Fill in project details
4. Click **"Create Project"**

## 🎨 Adding Comments

1. **Open your project** from the dashboard
2. Click **"Add Comments"** button (top right)
   - The button will turn red and say "Exit Comment Mode"
   - Your cursor will change to a crosshair
3. **Click anywhere** on the page where you want to add feedback
4. A popup will appear - **type your comment**
5. Click **"Add Comment"**
6. The comment is **automatically saved** to your browser
7. A numbered pin appears where you clicked

### Comment Features:

- **Numbered pins** show exactly where feedback applies
- **Click a pin** to highlight it and see the comment in the sidebar
- **Delete comments** by clicking the "Delete" button in the sidebar
- **Comments persist** even if you close the browser
- **Switch pages** - each page has its own set of comments

## 📱 Testing Responsive Layouts

Use the viewport buttons at the top:

- **Mobile** (375px) - iPhone size
- **Tablet** (768px) - iPad size  
- **Desktop** (1440px) - Standard desktop
- **Full Width** - Responsive to your browser window

Comments are saved with the viewport they were created on, so you can test and comment on different screen sizes.

## 📄 Exporting Feedback

When you're ready to share feedback:

1. Click **"Export PDF"** button (top right)
2. A PDF will be generated with:
   - Project name and client
   - All comments organised by page
   - Comment text and position information
   - Viewport information
3. The PDF downloads automatically
4. **Share the PDF** with your client via email

## 💡 Tips for Best Results

### For Designers/Developers:

- Create a project for each design iteration
- Use descriptive project names (e.g., "Betco v1.0", "Betco v1.1")
- Test all viewport sizes before sharing
- Export PDF before major changes

### For Clients:

- Take your time reviewing each page
- Be specific in your comments
- Use the viewport switcher to see mobile/tablet views
- Click "Export PDF" when done to send feedback

### Comment Best Practices:

- ✅ "Change this heading to 'Our Services' instead of 'What We Do'"
- ✅ "Make this button blue to match the brand colours"
- ✅ "Add more spacing between these sections"
- ❌ "This doesn't look right" (too vague)
- ❌ "Fix this" (not specific enough)

## 🔄 Workflow Example

1. **Designer**: Upload Betco mockups to Opace Annotate
2. **Designer**: Share the localhost URL with client (or deploy to Netlify)
3. **Client**: Reviews all pages, adds comments on each
4. **Client**: Exports PDF and emails to designer
5. **Designer**: Makes changes based on feedback
6. **Designer**: Creates new project version for next review

## 🌐 Deploying to Netlify (Optional)

To share with remote clients:

1. The code is already pushed to GitHub
2. Go to [Netlify](https://app.netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Connect to GitHub and select `website-critique-tool`
5. Netlify will auto-detect settings from `netlify.toml`
6. Click "Deploy"
7. Share the Netlify URL with your client

## 📞 Need Help?

- Check the main README.md for detailed documentation
- All comments are stored in browser LocalStorage
- Clear browser data will delete comments (export PDF first!)
- Works best in Chrome, Firefox, Safari, or Edge

## 🎯 Next Steps

1. Load your Betco mockups
2. Test the commenting system
3. Try exporting a PDF
4. Share with your client!

---

**Enjoy using Opace Annotate! 🎉**

