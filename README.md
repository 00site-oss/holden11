# Pro visual CMS (Holden-style admin)

## Deploy on Netlify
1. Push all files to GitHub
2. Import site on Netlify (publish: `.`)
3. Set env vars (required for Save):

```
SITE_ID=your-netlify-site-id
NETLIFY_AUTH_TOKEN=your-netlify-personal-access-token
```

4. Redeploy

## Admin
Open: `https://YOUR-SITE.netlify.app/admin.html`

- First visit: create password (8+ characters)
- Click elements to select, double-click to type
- Right panel: text, colors, images, duplicate/delete
- **Save & publish** goes live immediately
- Version history + Reset available

## Env vars (Netlify import)

```
SITE_ID=
NETLIFY_AUTH_TOKEN=
```

Site ID: Site configuration → General → Site details  
Token: User settings → Applications → Personal access tokens
