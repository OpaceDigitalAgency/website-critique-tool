# Netlify Deployment Guide

## 🚀 Deploying Opace Annotate to Netlify

This application is fully configured for Netlify deployment. Follow these steps to deploy:

## Prerequisites

- GitHub account (already set up ✅)
- Netlify account (free tier works perfectly)
- Repository pushed to GitHub ✅

## Deployment Steps

### 1. Log in to Netlify

Go to [https://app.netlify.com](https://app.netlify.com) and log in with your GitHub account.

### 2. Create New Site

1. Click **"Add new site"** → **"Import an existing project"**
2. Choose **"Deploy with GitHub"**
3. Authorise Netlify to access your GitHub repositories (if not already done)
4. Search for and select: **`OpaceDigitalAgency/website-critique-tool`**

### 3. Configure Build Settings

Netlify will automatically detect the settings from `netlify.toml`:

- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Functions directory**: `netlify/functions`

You don't need to change anything - just click **"Deploy site"**!

### 4. Wait for Deployment

- Netlify will install dependencies and build your site
- This usually takes 1-2 minutes
- You'll see a live deployment URL like: `https://random-name-123.netlify.app`

### 5. Customise Your Domain (Optional)

1. Go to **Site settings** → **Domain management**
2. Click **"Add custom domain"** or **"Change site name"**
3. Choose a memorable name like: `opace-annotate.netlify.app`

## 🔧 Configuration

The application is configured via `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

This ensures:
- ✅ Proper build process
- ✅ Correct output directory
- ✅ Client-side routing works correctly
- ✅ All routes redirect to index.html (SPA behaviour)

## 💾 Data Storage

**Important**: This application uses browser LocalStorage for data persistence.

### What This Means:

- ✅ **No server required** - fully client-side
- ✅ **Fast and responsive** - no API calls
- ✅ **Privacy-friendly** - data stays in the browser
- ⚠️ **Browser-specific** - comments are saved per browser/device
- ⚠️ **Clearing browser data** will delete all projects and comments

### For Production Use:

If you need to persist data across devices or share projects between users, you would need to:

1. Set up a backend database (e.g., Netlify Blobs, Supabase, Firebase)
2. Add authentication
3. Implement API endpoints

The current version is perfect for:
- ✅ Single-user local reviews
- ✅ Client feedback sessions (one device)
- ✅ Quick mockup reviews
- ✅ Exporting feedback as PDF

## 🌐 Sharing with Clients

### Option 1: Direct Link (Simple)

1. Share your Netlify URL: `https://your-site.netlify.app`
2. Client opens the link
3. Client creates a project and adds comments
4. Client exports PDF and emails it to you

### Option 2: Screen Share (Collaborative)

1. Open the app on your computer
2. Share your screen with the client (Zoom, Teams, etc.)
3. Walk through the mockups together
4. Add comments as you discuss
5. Export PDF at the end

### Option 3: Local Hosting (Same Network)

1. Run `npm run dev` on your computer
2. Find your local IP address
3. Share `http://YOUR-IP:3000` with client on same network
4. Client can access and add comments
5. Export PDF when done

## 🔄 Continuous Deployment

Netlify automatically redeploys when you push to GitHub:

```bash
# Make changes to your code
git add .
git commit -m "Add new feature"
git push

# Netlify automatically rebuilds and deploys!
```

## 📊 Monitoring

In your Netlify dashboard you can:

- View deployment history
- Check build logs
- Monitor site analytics
- Set up custom domains
- Configure environment variables

## 🐛 Troubleshooting

### Build Fails

Check the build log in Netlify dashboard. Common issues:

- **Missing dependencies**: Make sure `package.json` is up to date
- **Build command error**: Verify `npm run build` works locally
- **Node version**: Netlify uses Node 18 by default

### Site Loads But Doesn't Work

- Check browser console for errors
- Verify all assets are loading correctly
- Test locally first with `npm run build && npm run preview`

### Comments Not Saving

- Check browser LocalStorage is enabled
- Try a different browser
- Clear cache and reload

## 🎯 Next Steps After Deployment

1. ✅ Test the deployed site thoroughly
2. ✅ Create a test project with sample comments
3. ✅ Export a test PDF to verify functionality
4. ✅ Share the URL with your client
5. ✅ Provide them with the Quick Start guide

## 📞 Support

- **Netlify Docs**: [https://docs.netlify.com](https://docs.netlify.com)
- **Netlify Support**: Available in dashboard
- **GitHub Issues**: Report bugs in the repository

---

**Your app is ready to deploy! 🎉**

Repository: https://github.com/OpaceDigitalAgency/website-critique-tool

