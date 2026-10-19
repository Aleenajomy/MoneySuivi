import { test, expect } from '@playwright/test';
import { setupApiMocks } from './helpers/mockApi';

test.describe('Authentication UI & Functions', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page, { loggedIn: false });
  });

  test('should render the login page with all branding and form elements', async ({ page }) => {
    await page.goto('/#/login');

    // Branding / Titles
    await expect(page.locator('text=MoneySuivi').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();

    // Inputs & Button
    const emailInput = page.locator('#login-email');
    const passwordInput = page.locator('#login-password');
    const submitBtn = page.locator('#login-submit');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitBtn).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forgot Password?' })).toBeVisible();
    await expect(page.getByRole('link', { name: /create account/i })).toBeVisible();
  });

  test('should trigger client-side validations for empty and invalid login inputs', async ({ page }) => {
    await page.goto('/#/login');

    // Click submit with empty form
    await page.locator('#login-submit').click();

    // Field errors should show
    await expect(page.locator('text=Please enter your email address.')).toBeVisible();
    await expect(page.locator('text=Please enter your password.')).toBeVisible();

    // Enter invalid email format
    await page.locator('#login-email').fill('not-an-email');
    await page.locator('#login-submit').click();
    await expect(page.locator('text=Please enter a valid email address.')).toBeVisible();
  });

  test('should toggle password visibility on login form', async ({ page }) => {
    await page.goto('/#/login');

    const passwordInput = page.locator('#login-password');
    await passwordInput.fill('SecretPassword123');

    // Initially type is password
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click the toggle button
    const toggleButton = page.locator('#login-password ~ button');
    await toggleButton.click();

    // Should now be type text
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again to hide
    await toggleButton.click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('forgot password asks only for an email and shows a generic confirmation', async ({ page }) => {
    let requestBody = null;
    await page.route('**/api/auth/forgot-password', async (route) => {
      requestBody = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'If an account exists for that email, a password reset link has been sent.' }),
      });
    });
    await page.goto('/#/login');
    await page.getByRole('button', { name: 'Forgot Password?' }).click();

    await expect(page.getByRole('heading', { name: 'Forgot password?' })).toBeVisible();
    await expect(page.locator('#fp-email')).toBeVisible();
    // The old flow let anyone set a new password here; that field must not come back.
    await expect(page.locator('#fp-newPassword')).toHaveCount(0);

    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(page.locator('text=Please enter your email address.')).toBeVisible();

    await page.locator('#fp-email').fill('alex.morgan@example.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(requestBody).toEqual({ email: 'alex.morgan@example.com' });

    await page.getByRole('button', { name: /back to sign in/i }).click();
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  });

  test('reset password page sets a new password with the emailed token', async ({ page }) => {
    let requestBody = null;
    await page.route('**/api/auth/reset-password', async (route) => {
      requestBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
    await page.goto('/#/reset-password?token=abc123token456def789xyz');
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();

    await page.locator('#rp-password').fill('short');
    await page.locator('#rp-confirm').fill('short');
    await page.getByRole('button', { name: 'Set New Password' }).click();
    await expect(page.locator('text=Password must be 8-72 characters long.')).toBeVisible();

    await page.locator('#rp-password').fill('a-much-longer-password');
    await page.locator('#rp-confirm').fill('a-different-password');
    await page.getByRole('button', { name: 'Set New Password' }).click();
    await expect(page.locator('text=Passwords do not match.')).toBeVisible();

    await page.locator('#rp-confirm').fill('a-much-longer-password');
    await page.getByRole('button', { name: 'Set New Password' }).click();
    await expect(page).toHaveURL(/#\/login/);
    expect(requestBody).toEqual({ token: 'abc123token456def789xyz', password: 'a-much-longer-password' });
  });

  test('reset password page explains an expired or reused link', async ({ page }) => {
    await page.route('**/api/auth/reset-password', (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, code: 'INVALID_RESET_TOKEN', message: 'This reset link is invalid or has expired.' }),
    }));
    await page.goto('/#/reset-password?token=used-token-used-token-used');
    await page.locator('#rp-password').fill('a-much-longer-password');
    await page.locator('#rp-confirm').fill('a-much-longer-password');
    await page.getByRole('button', { name: 'Set New Password' }).click();
    await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible();

    await page.goto('/#/reset-password');
    await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible();
  });

  test('a failed login shows one generic message without revealing which field was wrong', async ({ page }) => {
    await page.route('**/api/auth/login', (route) => route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }),
    }));
    await page.goto('/#/login');
    await page.locator('#login-email').fill('alex.morgan@example.com');
    await page.locator('#login-password').fill('WrongPass123!');
    await page.locator('#login-submit').click();
    await expect(page.locator('text=Invalid email or password.')).toBeVisible();
    await expect(page.locator('text=No account found')).toHaveCount(0);
  });

  test('should navigate to Register page and validate required fields and password mismatch', async ({ page }) => {
    await page.goto('/#/login');

    // Click create account link
    await page.getByRole('link', { name: /create account/i }).click();

    await expect(page).toHaveURL(/#\/register/);
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible();

    // Submit empty registration
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.locator('text=Please enter your full name.')).toBeVisible();
    await expect(page.locator('text=Please enter your email address.')).toBeVisible();
    await expect(page.locator('text=Please enter a password.')).toBeVisible();

    // Test password mismatch
    await page.locator('input[placeholder="John Doe"]').fill('Test User');
    await page.locator('input[type="email"]').fill('newuser@example.com');
    await page.locator('input[placeholder="Min. 8 characters"]').fill('12345678');
    await page.locator('input[placeholder="Re-enter password"]').fill('different654');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.locator('text=Passwords do not match.')).toBeVisible();
  });

  test('should successfully log in and transition to the Dashboard', async ({ page }) => {
    await page.goto('/#/login');

    await page.locator('#login-email').fill('alex.morgan@example.com');
    await page.locator('#login-password').fill('ValidPass123!');
    await page.locator('#login-submit').click();

    // Should navigate to root/dashboard
    await expect(page).toHaveURL(/#\/?$/);
    await expect(page.locator('text=Total Balance').first()).toBeVisible();
  });

  test('should render mobile dashboard immediately without blank screen even when /auth/me is slow', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Seed logged-in session
    await page.addInitScript(() => {
      localStorage.setItem('token', 'mock_jwt_token_for_playwright_tests');
      localStorage.setItem('user', JSON.stringify({
        id: 'usr_test_123',
        name: 'Alex Morgan',
        email: 'alex.morgan@example.com'
      }));
    });

    // Simulate delayed /auth/me (backend cold start / slow network)
    await page.route('**/api/auth/me', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'usr_test_123',
            name: 'Alex Morgan',
            email: 'alex.morgan@example.com'
          }
        })
      });
    });

    await page.goto('/#/');

    // Mobile header branding and dashboard cards must be visible IMMEDIATELY without waiting 3s
    await expect(page.locator('header').getByText('MoneySuivi')).toBeVisible({ timeout: 1500 });
    await expect(page.getByRole('heading', { name: /Hello, Alex/i })).toBeVisible({ timeout: 1500 });
    await expect(page.locator('text=Total Balance').first()).toBeVisible({ timeout: 1500 });
  });

  test('should preserve user token and not log out when /auth/me has network error or timeout', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'mock_jwt_token_for_playwright_tests');
    });

    // Simulate network failure / abort on /auth/me
    await page.route('**/api/auth/me', async (route) => {
      return route.abort('failed');
    });

    await page.goto('/#/');

    // App shell must still be rendered, token preserved in localStorage
    await expect(page.locator('text=Total Balance').first()).toBeVisible();
    const tokenInStorage = await page.evaluate(() => localStorage.getItem('token'));
    expect(tokenInStorage).toBe('mock_jwt_token_for_playwright_tests');
  });

  test('should redirect to login when /auth/me genuinely returns 401 Unauthorized', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('token', 'expired_token');
    });

    await page.route('**/api/auth/me', async (route) => {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized - Token Expired' })
      });
    });

    await page.goto('/#/');

    // Should redirect to login page and remove token
    await expect(page).toHaveURL(/#\/login/);
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    const tokenInStorage = await page.evaluate(() => localStorage.getItem('token'));
    expect(tokenInStorage).toBeNull();
  });
});
