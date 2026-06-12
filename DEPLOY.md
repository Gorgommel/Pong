# Deploy do Pong MQTT

## HiveMQ Cloud

O broker cria os topicos automaticamente quando os clientes publicam ou
assinam. Nao crie `pong/sala1/...` manualmente no painel.

Crie preferencialmente tres credenciais:

- `pong-backend`: publicar e assinar `pong/#`.
- `pong-front`: publicar `pong/sala1/comandos` e `pong/sala1/chat`; assinar
  `pong/sala1/#`.
- `pong-esp32`: publicar movimentos/status/comandos; assinar comandos.

Use uma senha diferente para cada cliente. Credenciais usadas no frontend
ficam visiveis no navegador e, portanto, devem ter permissoes limitadas.

## Backend no Render

1. Envie o repositorio para o GitHub.
2. No Render, crie um **Web Service** conectado ao repositorio.
3. Configure **Root Directory** como `pong-back`.
4. Configure **Build Command**:

   `pip install -r requirements.txt`

5. Configure **Start Command**:

   `uvicorn pong_backend:app --host 0.0.0.0 --port $PORT`

6. Cadastre estas Environment Variables:

   - `MQTT_HOST=3e87dd33d5184c218a8534b6a63bce96.s1.eu.hivemq.cloud`
   - `MQTT_PORT=8883`
   - `MQTT_USER=<usuario exclusivo do backend>`
   - `MQTT_PASS=<senha>`
   - `MQTT_TLS=true`

7. Depois do deploy, acesse `https://SEU-SERVICO.onrender.com/health`.

## Frontend no Vercel

1. Importe o mesmo repositorio no Vercel.
2. Configure **Root Directory** como `pong-front`.
3. O preset deve ser **Vite**.
4. Configure **Build Command** como `npm run build`.
5. Configure **Output Directory** como `dist`.
6. Cadastre estas Environment Variables:

   - `VITE_BROKER_URL=wss://3e87dd33d5184c218a8534b6a63bce96.s1.eu.hivemq.cloud:8884/mqtt`
   - `VITE_MQTT_USER=<usuario limitado do frontend>`
   - `VITE_MQTT_PASS=<senha>`

7. Solicite um novo deploy depois de alterar variaveis `VITE_*`, pois elas sao
   incorporadas ao bundle durante o build.

## ESP32

1. Duplique `pong-esp32/secrets.example.h` como `pong-esp32/secrets.h`.
2. Preencha host, usuario e senha do cliente ESP32.
3. Ajuste `WIFI_SSID` e `WIFI_PASSWORD` no sketch.
4. Instale `PubSubClient` e `ArduinoJson` no Arduino IDE.
5. Compile e envie para o ESP32.

O sketch usa TLS na porta `8883`. Para a demonstracao, `setInsecure()` aceita o
certificado sem validar a CA; em producao, troque por `setCACert(...)`.
