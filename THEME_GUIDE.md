# Theme Guide - How to Change Colors

All colors in the project are centralized in one file for easy customization.

## Location
**File:** `src/styles/theme.css`

## How to Change Colors

1. Open `src/styles/theme.css`
2. Find the color variable you want to change
3. Update the color value
4. Save the file
5. The change will apply automatically across the entire project!

## Available Color Variables

### Header Colors
- `--header-bg`: Dark brown background (#3e2723)
- `--header-text`: White text color (#ffffff)
- `--header-logo-bg`: Yellow/Gold circle background (#ffd700)
- `--header-logo-symbol`: Purple Om symbol color (#9c27b0)
- `--header-link-hover`: Gold color on hover (#ffd700)

### Background Colors
- `--bg-primary`: Dark blue-grey center (#2a3441)
- `--bg-secondary`: Darker blue-grey (#1e2835)
- `--bg-tertiary`: Even darker (#1a2330)
- `--bg-darkest`: Black corners (#000000)

### Card/Container Colors
- `--card-bg`: Dark grey card background (#3a3a3a)
- `--card-border`: Subtle border color
- `--card-shadow`: Card shadow color

### Text Colors
- `--text-primary`: White (#ffffff)
- `--text-secondary`: Slightly transparent white
- `--text-muted`: Muted white

### Accent Colors
- `--accent-gold`: Gold accent (#ffd700)
- `--accent-purple`: Purple accent (#9c27b0)
- `--accent-yellow`: Yellow accent (#ffd700)

### Button Colors
- `--btn-primary`: Primary button color (#4CAF50)
- `--btn-primary-hover`: Primary button hover (#45a049)
- `--btn-secondary`: Secondary button color (#1976d2)
- `--btn-secondary-hover`: Secondary button hover (#1565c0)

## Example: Change Header Background

```css
:root {
  --header-bg: #your-color-here;
}
```

That's it! The header background will change across the entire site.

## Responsive Design

The project is fully responsive with breakpoints:
- **Desktop**: Default styles
- **Tablet**: 968px and below
- **Mobile**: 640px and below
- **Small Mobile**: 480px and below

All components automatically adjust font sizes, spacing, and layouts based on screen size.

