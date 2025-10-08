// /scripts/api/auth.js (ВИПРАВЛЕНА ВЕРСІЯ)

import { renderCategoriesTable } from '../components/table.js'; // <-- ДОДАЄМО ІМПОРТ

const CLIENT_ID = '431864072155-l006mvdsf5d67ilevfica0elcc1d0fl8.apps.googleusercontent.com';
const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tokenClient;
const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');

export function initAuth() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({ discoveryDocs: DISCOVERY_DOCS });

    const storedToken = localStorage.getItem('google_auth_token');
    if (storedToken) {
        const tokenObject = JSON.parse(storedToken);
        if (tokenObject.expires_at > Date.now()) {
            gapi.client.setToken(tokenObject);
            updateUi(true);
            return; // Виходимо, бо updateUi викличе завантаження таблиці
        } else {
            localStorage.removeItem('google_auth_token');
        }
    }
    
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                tokenResponse.expires_at = Date.now() + (tokenResponse.expires_in * 1000);
                localStorage.setItem('google_auth_token', JSON.stringify(tokenResponse));
                updateUi(true);
            }
        },
    });
    updateUi(false);
}

function updateUi(isSignedIn) {
    if (isSignedIn) {
        authorizeButton.style.display = 'none';
        signoutButton.style.display = 'block';
        renderCategoriesTable();
    } else {
        authorizeButton.style.display = 'block';
        signoutButton.style.display = 'none';
    }
}

authorizeButton.onclick = function handleAuthClick() {
    if (tokenClient) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    }
};

signoutButton.onclick = function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        localStorage.removeItem('google_auth_token');
        updateUi(false);
    }
};