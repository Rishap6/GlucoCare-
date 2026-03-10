// Shared API helper for authenticated requests
var API = {
    getToken: function() {
        return localStorage.getItem('token');
    },
    getUser: function() {
        var u = localStorage.getItem('user');
        return u ? JSON.parse(u) : null;
    },
    logout: function() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/auth/login/login.html';
    },
    request: function(url, options) {
        options = options || {};
        options.headers = options.headers || {};
        options.headers['Content-Type'] = 'application/json';
        var token = this.getToken();
        if (token) {
            options.headers['Authorization'] = 'Bearer ' + token;
        }
        return fetch(url, options).then(function(response) {
            if (response.status === 401) {
                API.logout();
                return Promise.reject(new Error('Session expired. Please log in again.'));
            }
            return response.text().then(function(raw) {
                var data = {};
                try {
                    data = raw ? JSON.parse(raw) : {};
                } catch (e) {
                    data = { raw: raw };
                }
                return { ok: response.ok, data: data };
            });
        });
    },
    get: function(url) {
        return this.request(url, { method: 'GET' });
    },
    post: function(url, body) {
        return this.request(url, { method: 'POST', body: JSON.stringify(body) });
    },
    put: function(url, body) {
        return this.request(url, { method: 'PUT', body: JSON.stringify(body) });
    },
    patch: function(url, body) {
        return this.request(url, { method: 'PATCH', body: JSON.stringify(body) });
    },
    delete: function(url) {
        return this.request(url, { method: 'DELETE' });
    }
};

// Auth guard — redirect to login if not authenticated
function requireAuth(role) {
    var token = API.getToken();
    var user = API.getUser();
    if (!token || !user) {
        API.logout();
        return false;
    }
    if (role && user.role !== role) {
        API.logout();
        return false;
    }
    return true;
}

// Stronger auth guard: validates token + role with backend session state.
async function verifyAuthRole(expectedRole) {
    if (typeof API === 'undefined') return false;

    var token = API.getToken();
    var user = API.getUser();
    if (!token || !user) {
        API.logout();
        return false;
    }

    if (expectedRole && user.role !== expectedRole) {
        API.logout();
        return false;
    }

    try {
        var me = await API.get('/api/auth/me');
        if (!me.ok || !me.data || !me.data.user) {
            API.logout();
            return false;
        }

        var backendUser = me.data.user;
        if (expectedRole && backendUser.role !== expectedRole) {
            API.logout();
            return false;
        }

        // Keep local cache aligned with backend identity.
        localStorage.setItem('user', JSON.stringify(backendUser));
        return true;
    } catch (err) {
        API.logout();
        return false;
    }
}
