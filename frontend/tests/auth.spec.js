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

  test('should toggle Forgot Password view, validate inputs, and return back', async ({ page }) => {
    await page.goto('/#/login');

    // Click forgot password link
    await page.getByRole('button', { name: 'Forgot Password?' }).click();

    // Reset password header should appear
    await expect(page.getByRole('heading', { name: 'New Password' })).toBeVisible();
    await expect(page.locator('#fp-email')).toBeVisible();
    await expect(page.locator('#fp-newPassword')).toBeVisible();
    await expect(page.locator('#fp-confirm')).toBeVisible();

    // Submit without inputs to verify forgot password validations
    await page.getByRole('button', { name: 'Reset Password' }).click();
    await expect(page.locator('text=Please enter your email address.')).toBeVisible();

    // Return back to Sign In
    await page.getByRole('button', { name: /back to sign in/i }).click();
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
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
    await page.locator('input[placeholder="Min. 6 characters"]').fill('123456');
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
