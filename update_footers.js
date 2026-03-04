const fs = require('fs');
const path = require('path');

const dir = './Frontend';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'footer.html');

for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove static footer
    const footerRegex = /<footer class="main-footer">[\s\S]*?<\/footer>/g;
    content = content.replace(footerRegex, '');

    // Add global footer placement div if not exists
    if (!content.includes('id="global-footer"')) {
        // Find <script src="js/script.js"></script> and inject before it
        content = content.replace(/<script src="js\/script\.js"><\/script>/,
            '<div id="global-footer"></div>\n    <script src="js/script.js"></script>');
    }

    // Clean up empty lines left by footer removal
    content = content.replace(/\n\s*\n\s*<script/g, '\n\n    <script');

    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
}
