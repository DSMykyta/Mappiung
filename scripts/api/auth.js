/**
 * scripts/api/auth.js
 * Відповідає за авторизацію Google (Google Identity Services - GIS) та ініціалізацію GAPI.
 * Ця версія поєднує надійність асинхронної ініціалізації та подієво-орієнтований підхід.
 */

// !!! ВАЖЛИВО: Переконайтесь, що ці дані відповідають вашому проєкту в Google Cloud Console !!!
const CLIENT_ID = '431864072155-l006mvdsf5d67ilevfica0elcc1d0fl8.apps.googleusercontent.com';
const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient = null;
let gapiInited = false;
let gapiReadyPromise = null;

// Посилання на елементи UI
let authorizeButton;
let signoutButton;

/**
 * Ініціалізує Google API (GAPI) та Google Identity Services (GIS).
 * Ця функція викликається один раз при старті додатку.
 */
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
        // Паралельно завантажуємо GAPI та GIS клієнти для швидкості
        await Promise.all([
            loadGapiClient(),
            initializeGsiClient()
        ]);
        console.log("[Auth] GAPI та GIS успішно завантажено.");

        // Перевіряємо наявність збереженого токену
        const storedToken = localStorage.getItem('google_auth_token');
        if (storedToken) {
            const tokenObject = JSON.parse(storedToken);
            // Важлива перевірка: чи не закінчився термін дії токену
            if (tokenObject.expires_at > Date.now()) {
                console.log("[Auth] Знайдено дійсний токен. Відновлюємо сесію.");
                gapi.client.setToken(tokenObject);
                updateUi(true);
                return; // Виходимо, оскільки сесія вже активна
            } else {
                console.log("[Auth] Знайдено протермінований токен. Видаляємо.");
                localStorage.removeItem('google_auth_token');
            }
        }

        // Якщо дійсного токену немає, показуємо кнопку входу
        updateUi(false);

    } catch (error) {
        console.error("[Auth] Критична помилка під час ініціалізації Google Services:", error);
    }
}

/**
 * Завантажує та ініціалізує GAPI клієнт.
 */
function loadGapiClient() {
    return new Promise((resolve, reject) => {
        // Перевіряємо наявність gapi, оскільки скрипт завантажується асинхронно
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

/**
 * Ініціалізує Google Identity Services клієнт для отримання токенів.
 */
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
                            // Додаємо час закінчення дії токену для подальших перевірок
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

/**
 * Обробляє відповідь від GIS після спроби авторизації.
 */
function handleGisCallback(response) {
    if (response.error) {
        console.error("[Auth] Помилка отримання токену:", response.error);
        updateUi(false);
        return;
    }
    console.log("[Auth] Токен доступу успішно отримано.");
    updateUi(true); // Оновлюємо інтерфейс на "залогінений"
}

/**
 * Оновлює інтерфейс та сповіщає додаток про зміну статусу авторизації.
 */
function updateUi(isSignedIn) {
    authorizeButton.style.display = isSignedIn ? 'none' : 'block';
    signoutButton.style.display = isSignedIn ? 'block' : 'none';

    // Створюємо кастомну подію, щоб інші частини додатку (напр. main.js)
    // могли реагувати на зміну статусу, не будучи напряму пов'язаними з цим модулем.
    const authEvent = new CustomEvent('authStatusChange', {
        detail: { isSignedIn }
    });
    document.dispatchEvent(authEvent);
}

/**
 * Ініціює процес авторизації при кліку на кнопку.
 */
function handleAuthClick() {
    if (!tokenClient) {
        console.error("[Auth] Token Client не ініціалізовано.");
        return;
    }
    // Якщо токен вже є, намагаємося оновити його без згоди користувача.
    // Якщо ні - запитуємо згоду.
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

/**
 * Виконує вихід користувача з системи.
 */
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
        // Перезавантаження сторінки гарантує, що всі дані будуть очищені.
        window.location.reload();
    }
}

/**
 * Допоміжна функція, яка дозволяє іншим модулям перевірити, чи готовий GAPI.
 * @returns {Promise<void>}
 */
export function isGapiReady() {
    if (!gapiReadyPromise) {
        gapiReadyPromise = new Promise((resolve, reject) => {
            if (gapiInited && gapi.client.getToken()) {
                resolve();
            }
            // Якщо GAPI ще не готовий, слухач події `authStatusChange`
            // врешті-решт викличе resolve або reject.
             document.addEventListener('authStatusChange', (e) => {
                if(e.detail.isSignedIn) resolve();
                else reject(new Error("Користувач не авторизований."));
            }, { once: true });
        });
    }
    return gapiReadyPromise;
}