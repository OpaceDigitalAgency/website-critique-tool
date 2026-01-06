# Opace Annotate

**Visual Feedback & Website Critique Tool for Design Mockups**

A powerful, intuitive web application for reviewing static HTML mockups and live websites with visual feedback capabilities. Perfect for designers, developers, and clients to collaborate on website feedback.

## Features

### 🎯 Core Functionality

- **Multiple Input Methods**
  - Upload HTML files from your computer
  - Add live website URLs for review
  - Drag-and-drop support for easy project creation

- **Responsive Viewport Testing**
  - Mobile (375px)
  - Tablet (768px)
  - Desktop (1440px)
  - Full-width responsive view
  - Test your designs across all common device sizes

- **Visual Commenting System**
  - Figma-style pin-based comments
  - Click anywhere on the page to add feedback
  - Comments are numbered and easy to navigate
  - Visual indicators show exactly where feedback applies

- **Comment Persistence**
  - All comments automatically saved to browser LocalStorage
  - Never lose your feedback between sessions
  - Comments persist across page navigation

- **Professional Feedback Export**
  - Generate comprehensive PDF reports
  - Includes all comments with context
  - Shows viewport and position information
  - Perfect for sharing with clients or team members

### 📋 Project Management

- Dashboard view of all projects
- Project metadata (name, client, description)
- Quick access to recent projects
- Delete unwanted projects
- Track number of pages and comments

## Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/OpaceDigitalAgency/website-critique-tool.git

# Navigate to the project directory
cd website-critique-tool

# Install dependencies
npm install

# Start the development server
npm run dev
```

The application will be available at `http://localhost:3000`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

### Creating a Project

1. Click "Upload HTML Files" or "Add Website URL" on the dashboard
2. Fill in project details (name, client, description)
3. Select your HTML files or enter a website URL
4. Click "Create Project"

### Adding Comments

1. Open a project from the dashboard
2. Click "Add Comments" to enter comment mode
3. Click anywhere on the page to place a comment pin
4. Enter your feedback in the popup
5. Comments are automatically saved

### Exporting Feedback

1. Click "Export PDF" in the project viewer
2. A comprehensive PDF report will be generated
3. Share the PDF with your client or team

## Deployment

### Netlify

This application is optimised for Netlify deployment:

1. Push your code to GitHub
2. Connect your repository to Netlify
3. Netlify will automatically detect the build settings
4. Deploy!

The `netlify.toml` file is already configured with the correct build settings.

## Technology Stack

- **Frontend**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **PDF Generation**: jsPDF
- **Screenshots**: html2canvas
- **Icons**: Lucide React
- **Storage**: Browser LocalStorage

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Licence

MIT Licence - see LICENCE file for details

## Support

For issues, questions, or suggestions, please open an issue on GitHub.

---

**Built with ❤️ by Opace Digital Agency**

