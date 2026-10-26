DYNAMICS_TENANT_ID=op://Clients/FusionFlow - Dynamics dev.vars/DYNAMICS_TENANT_ID
DYNAMICS_CLIENT_ID=op://Clients/FusionFlow - Dynamics dev.vars/DYNAMICS_CLIENT_ID
DYNAMICS_CLIENT_SECRET=op://Clients/FusionFlow - Dynamics dev.vars/DYNAMICS_CLIENT_SECRET

# Not a secret: local dev serves plain HTTP, so APP_URL must not be https://
# (it decides the session cookie's Secure flag).
APP_URL=http://localhost:5173

# ScanSource partner API (APIM at api.scansource.com/scsc). Token is Azure AD
# client credentials; the "API key" is the Ocp-Apim-Subscription-Key.
SCANSOURCE_CLIENT_ID=op://Clients/ScanSource API Portal/SCANSOURCE_CLIENT_ID
SCANSOURCE_CLIENT_SECRET=op://Clients/ScanSource API Portal/SCANSOURCE_CLIENT_SECRET
SCANSOURCE_SUBSCRIPTION_KEY=op://Clients/ScanSource API Portal/PRIMARY_API_KEY
SCANSOURCE_CUSTOMER_NUMBER=op://Clients/ScanSource API Portal/PARTNER_NUMBER
