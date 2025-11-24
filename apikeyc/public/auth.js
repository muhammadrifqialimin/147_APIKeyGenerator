// Auth management for frontend
class Auth {
  constructor() {
    this.sessionId = localStorage.getItem("adminSessionId");
    this.admin = JSON.parse(localStorage.getItem("admin") || "null");
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!(this.sessionId && this.admin);
  }

  // Login function
  async login(email, password) {
    try {
      const response = await fetch("/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        this.sessionId = data.sessionId;
        this.admin = data.admin;

        // Store in localStorage
        localStorage.setItem("adminSessionId", this.sessionId);
        localStorage.setItem("admin", JSON.stringify(this.admin));

        return { success: true, data };
      } else {
        return { success: false, message: data.message };
      }
    } catch (error) {
      return { success: false, message: "Network error" };
    }
  }

  // Logout function
  async logout() {
    if (this.sessionId) {
      try {
        await fetch("/admin/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.sessionId}`,
          },
        });
      } catch (error) {
        console.error("Logout error:", error);
      }
    }

    // Clear local storage
    this.sessionId = null;
    this.admin = null;
    localStorage.removeItem("adminSessionId");
    localStorage.removeItem("admin");
  }

  // Get auth headers for API calls
  getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.sessionId}`,
    };
  }

  // Check auth status with server
  async checkAuthStatus() {
    if (!this.sessionId) {
      return { authenticated: false };
    }

    try {
      const response = await fetch("/admin/auth-status", {
        headers: this.getAuthHeaders(),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { authenticated: false };
    }
  }
}

// Create global auth instance
const auth = new Auth();
