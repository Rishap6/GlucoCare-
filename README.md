# GlucoCare Static Frontend

Feature-based static project structure for GlucoCare landing and auth pages.

## Structure

```text
public/
  index.html
  home/
    home.css
    home.js
  auth/
    login.html
    register.html
    login/
      login.css
      login.js
    register/
      register.css
      register.js
```

## Run Locally

From project root:

```powershell
cd public
python -m http.server 3000
```

Open `http://localhost:3000`.
