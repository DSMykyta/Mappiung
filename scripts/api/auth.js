/**
 * scripts/api/auth.js
 * Відповідає за авторизацію Google (GIS) та ініціалізацію GAPI.
 */

// !!! ВАЖЛИВО: Переконайтесь, що ці дані відповідають вашому проєкту в Google Cloud Console !!!
const CLIENT_ID = '431864072155-l006mvdsf5d67ilevfica0elcc1d0fl8.apps.googleusercontent.com';
export const SPREADSHEET_ID = '1iFOCQUbisLprSfIkfCar3Oc5f8JW12kA0dpHzjEXSsk';
// !!! -------------------------------------------------- !!!

const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient = null;
let gapiInited = false;
let gapiReadyPromise = null;

let authorizeButton;
let signoutButton;

export async function initAuth() {
    console.log("[Auth] Початок ініціалізації GAPI та GIS...");
    
    authorizeButton = document.getElementById('authorize_button');
    signoutButton = document.getElementById('signout_button');

    if (!authorizeButton || !signoutButton) {
        console.error("[Auth] Не знайдено кнопки авторизації/виходу.");
        return;
    }

    authorizeButton.onclick = handleAuthClick;
    signoutButton.onclick = signOut;

    try {
        await Promise.all([
            loadGapiClient(),
            initializeGsiClient()
        ]);
        console.log("[Auth] GAPI та GIS успішно завантажено.");

        const storedToken = localStorage.getItem('google_auth_token');
        if (storedToken) {
            const tokenObject = JSON.parse(storedToken);
            if (tokenObject.expires_at > Date.now()) {
                console.log("[Auth] Знайдено дійсний токен. Відновлюємо сесію.");
                gapi.client.setToken(tokenObject);
                updateUi(true);
                return;
            } else {
                console.log("[Auth] Знайдено протермінований токен. Видаляємо.");
                localStorage.removeItem('google_auth_token');
            }
        }

        updateUi(false);

    } catch (error) {
        console.error("[Auth] Критична помилка під час ініціалізації Google Services:", error);
    }
}

function loadGapiClient() {
    return new Promise((resolve, reject) => {
        const intervalId = setInterval(() => {
            if (window.gapi) {
                clearInterval(intervalId);
                gapi.load('client', async () => {
                    try {
                        await gapi.client.init({ discoveryDocs: DISCOVERY_DOCS });
                        gapiInited = true;
                        console.log("[Auth] GAPI Client ініціалізовано.");
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        }, 100);
    });
}

function initializeGsiClient() {
    return new Promise((resolve, reject) => {
        const intervalId = setInterval(() => {
            if (window.google && window.google.accounts) {
                clearInterval(intervalId);
                try {
                    tokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: CLIENT_ID,
                        scope: SCOPES,
                        callback: (response) => {
                            if (response && response.access_token) {
                                response.expires_at = Date.now() + (response.expires_in * 1000);
                                localStorage.setItem('google_auth_token', JSON.stringify(response));
                            }
                            handleGisCallback(response);
                        },
                    });
                    console.log("[Auth] GIS Token Client ініціалізовано.");
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }
        }, 100);
    });
}

function handleGisCallback(response) {
    if (response.error) {
        console.error("[Auth] Помилка отримання токену:", response.error);
        updateUi(false);
        return;
    }
    console.log("[Auth] Токен доступу успішно отримано.");
    updateUi(true);
}

function updateUi(isSignedIn) {
    authorizeButton.style.display = isSignedIn ? 'none' : 'block';
    signoutButton.style.display = isSignedIn ? 'block' : 'none';

    const authEvent = new CustomEvent('authStatusChange', {
        detail: { isSignedIn }
    });
    document.dispatchEvent(authEvent);
}

function handleAuthClick() {
    if (!tokenClient) {
        console.error("[Auth] Token Client не ініціалізовано.");
        return;
    }
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

export function signOut() {
    const token = gapi.client.getToken();
    if (token !== null) {
        console.log("[Auth] Виконується вихід користувача...");
        google.accounts.oauth2.revoke(token.access_token, () => {
            console.log('[Auth] Токен доступу скасовано.');
        });
        gapi.client.setToken(null);
        localStorage.removeItem('google_auth_token');
        updateUi(false);
        console.log("[Auth] Користувач вийшов. Перезавантаження сторінки...");
        window.location.reload();
    }
}

export function isGapiReady() {
    if (!gapiReadyPromise) {
        gapiReadyPromise = new Promise((resolve, reject) => {
            if (gapiInited && gapi.client.getToken()) {
                resolve();
            }
             document.addEventListener('authStatusChange', (e) => {
                if(e.detail.isSignedIn) resolve();
                else reject(new Error("Користувач не авторизований."));
            }, { once: true });
        });
    }
    return gapiReadyPromise;
}