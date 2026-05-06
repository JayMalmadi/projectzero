#!/bin/bash
set -e
echo "🚀 Setting up Delta Exchange proxy on Hetzner..."

# Update and install Node.js
apt-get update -qq
apt-get install -y curl 2>/dev/null
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
apt-get install -y nodejs 2>/dev/null
echo "✅ Node.js $(node --version) installed"

# Create proxy directory and app
mkdir -p /opt/delta-proxy
cat > /opt/delta-proxy/server.js << 'JSEOF'
const https  = require('https')
const http   = require('http')
const crypto = require('crypto')

const PORT       = 3128
const API_KEY    = process.env.DELTA_API_KEY    || ''
const API_SECRET = process.env.DELTA_API_SECRET || ''

function sign(secret, method, timestamp, path, body='') {
  return crypto.createHmac('sha256', secret)
    .update(method + timestamp + path + body).digest('hex')
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

  if (req.url === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'})
    res.end(JSON.stringify({status:'ok', service:'delta-proxy', ip:'178.105.45.73'}))
    return
  }

  if (req.url === '/delta-proxy' && req.method === 'POST') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const {path, method='GET', payload} = JSON.parse(body)
        if (!path || !path.startsWith('/v2/')) {
          res.writeHead(400)
          res.end(JSON.stringify({error:'Invalid path — must start with /v2/'}))
          return
        }
        const timestamp = Math.floor(Date.now()/1000).toString()
        const bodyStr   = payload ? JSON.stringify(payload) : ''
        const sig       = sign(API_SECRET, method, timestamp, path, bodyStr)

        const opts = {
          hostname: 'api.india.delta.exchange',
          path, method,
          headers: {
            'Content-Type': 'application/json',
            'api-key':   API_KEY,
            'timestamp': timestamp,
            'signature': sig,
            'User-Agent':'projectzero-hetzner/1.0',
          }
        }

        const dr = https.request(opts, dres => {
          let data = ''
          dres.on('data', c => data += c)
          dres.on('end', () => {
            res.writeHead(dres.statusCode, {'Content-Type':'application/json'})
            res.end(data)
          })
        })
        dr.on('error', e => { res.writeHead(500); res.end(JSON.stringify({error:e.message})) })
        if (bodyStr) dr.write(bodyStr)
        dr.end()
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({error:e.message}))
      }
    })
    return
  }

  res.writeHead(404); res.end(JSON.stringify({error:'Not found'}))
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Delta proxy running on port ${PORT}`)
  console.log(`   Fixed IP: 178.105.45.73`)
  console.log(`   Health: http://178.105.45.73:${PORT}/health`)
})
JSEOF

# Systemd service
cat > /etc/systemd/system/delta-proxy.service << SVCEOF
[Unit]
Description=Delta Exchange Proxy
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/delta-proxy
ExecStart=/usr/bin/node /opt/delta-proxy/server.js
Restart=always
RestartSec=5
Environment=DELTA_API_KEY=qGdQXSFIfl5G7hdKV5MwFcG0JtNPa9
Environment=DELTA_API_SECRET=d5yzJyMc8kMCr7fuMqVCbcTjlW5Io8qnhWCIRBs0uIWdDH90GCac3IlwS2i9
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable delta-proxy
systemctl start delta-proxy

# Allow port 3128 through firewall
ufw allow 22/tcp 2>/dev/null || true
ufw allow 3128/tcp 2>/dev/null || true

sleep 2

# Test
if curl -s http://localhost:3128/health | grep -q 'ok'; then
  echo ""
  echo "✅ SUCCESS! Delta proxy is running!"
  echo "   URL: http://178.105.45.73:3128"
  echo "   Test: curl http://178.105.45.73:3128/health"
else
  echo "❌ Something went wrong. Check: journalctl -u delta-proxy -n 20"
fi
