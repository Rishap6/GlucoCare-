// Shared API helper for authenticated requests
var API = {
    getToken: function() {
        return sessionStorage.getItem('token');
    },
    getUser: function() {
        var u = sessionStorage.getItem('user');
        return u ? JSON.parse(u) : null;
    },
    logout: function() {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/auth/login/login.html';
    },
    request: function(url, options) {
        options = options || {};
        var timeoutMs = Number(options.timeoutMs || 0);
        if (Object.prototype.hasOwnProperty.call(options, 'timeoutMs')) {
            delete options.timeoutMs;
        }

        var controller = null;
        var timeoutHandle = null;
        if (typeof AbortController !== 'undefined' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
            controller = new AbortController();
            options.signal = controller.signal;
            timeoutHandle = setTimeout(function() {
                controller.abort();
            }, timeoutMs);
        }

        options.headers = options.headers || {};
        options.headers['Content-Type'] = 'application/json';
        var token = this.getToken();
        if (token) {
            options.headers['Authorization'] = 'Bearer ' + token;
        }
        return fetch(url, options)
            .then(function(response) {
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
            })
            .catch(function(err) {
                if (err && err.name === 'AbortError') {
                    return {
                        ok: false,
                        data: {
                            error: 'Request timed out. Please try again.',
                        },
                    };
                }
                throw err;
            })
            .finally(function() {
                if (timeoutHandle) clearTimeout(timeoutHandle);
            });
    },
    get: function(url, requestOptions) {
        var options = Object.assign({}, requestOptions || {}, { method: 'GET' });
        return this.request(url, options);
    },
    post: function(url, body, requestOptions) {
        var options = Object.assign({}, requestOptions || {}, { method: 'POST', body: JSON.stringify(body) });
        return this.request(url, options);
    },
    put: function(url, body, requestOptions) {
        var options = Object.assign({}, requestOptions || {}, { method: 'PUT', body: JSON.stringify(body) });
        return this.request(url, options);
    },
    patch: function(url, body, requestOptions) {
        var options = Object.assign({}, requestOptions || {}, { method: 'PATCH', body: JSON.stringify(body) });
        return this.request(url, options);
    },
    delete: function(url, requestOptions) {
        var options = Object.assign({}, requestOptions || {}, { method: 'DELETE' });
        return this.request(url, options);
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

        // Keep tab-local auth cache aligned with backend identity.
        sessionStorage.setItem('user', JSON.stringify(backendUser));
        return true;
    } catch (err) {
        API.logout();
        return false;
    }
}
