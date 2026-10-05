// Nạp và biên dịch template Handlebars phía client.
const templateCache = new Map();

async function renderTemplate(templateName, data = {}) {
    let template = templateCache.get(templateName);

    if (!template) {
        const response = await fetch(`templates/${templateName}.hbs`);
        if (!response.ok) {
            throw new Error(`Không tải được template "${templateName}".`);
        }

        template = Handlebars.compile(await response.text());
        templateCache.set(templateName, template);
    }

    return template(data);
}
