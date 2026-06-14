# Roteiro da apresentacao - Pong MQTT

Tempo sugerido: 8 a 10 minutos.

## Divisao da fala

Preencha os nomes antes da apresentacao:

- Integrante 1: introducao, arquitetura e MQTT.
- Integrante 2: ESP32, backend, interface e demonstracao.
- Todos: responder perguntas.

## Fala por slide

1. **Pong MQTT:** o objetivo e provar comunicacao real pela internet entre
   ESP32, backend e navegador.
2. **Arquitetura:** o HiveMQ entrega mensagens; o backend e a fonte oficial da
   partida; o frontend exibe e envia comandos.
3. **QoS:** movimento usa QoS 0 por baixa latencia; comandos e placar usam QoS
   1; estado critico usa QoS 2.
4. **ESP32:** girar o potenciometro e mostrar raquete, log e grafico reagindo.
5. **Backend:** explicar fisica centralizada, validacao e `command_id`.
6. **Interface:** mostrar status, comandos, jogo, logs, chat e graficos.
7. **LWT e retained:** diferenciar queda inesperada de ultima mensagem salva.
8. **Evidencias:** mostrar Render, HiveMQ e pasta `evidencias`.
9. **Rubrica:** reforcar o que esta implementado e nao prometer banco de dados.
10. **Demonstracao:** seguir a ordem abaixo.

## Demonstracao ao vivo

1. Abrir https://pong-mqtt-backend.onrender.com/health e confirmar
   `"mqtt_connected": true`.
2. Abrir https://pong-front.vercel.app/ e confirmar HiveMQ conectado.
3. Ligar o ESP32 e confirmar status online.
4. Girar o potenciometro e mostrar raquete, log MQTT e grafico.
5. Executar `Iniciar`, `Pausar`, `Retomar` e `Sair`.
6. Desligar abruptamente o ESP32 para demonstrar o LWT offline.
7. Abrir nova aba para demonstrar retained.

## Respostas curtas para perguntas provaveis

**Por que movimento usa QoS 0?**  
Porque e publicado muitas vezes por segundo. Se uma mensagem for perdida, a
proxima substitui rapidamente a anterior, evitando atraso por retransmissao.

**Por que existe um backend autoritativo?**  
Para todos os clientes enxergarem a mesma bola, colisao e placar. Se cada
navegador calculasse sozinho, as partidas poderiam divergir.

**Qual a diferenca entre LWT e retained?**  
LWT e publicado automaticamente pelo broker quando um cliente cai sem
desconectar. Retained guarda a ultima mensagem para novos assinantes.

**Como QoS 1 evita executar o comando duas vezes?**  
Cada comando recebe um `command_id`; o backend ignora IDs ja processados.

**Como o sistema esta seguro?**  
Clientes usam usuarios separados com permissoes limitadas e conexoes TLS na
porta 8883 ou WSS na porta 8884.

## Antes de apresentar

- Preencher nomes completos e RA no README e nos slides.
- Tirar foto do circuito fisico.
- Adicionar captura do MQTT Explorer.
- Trocar as senhas que foram compartilhadas durante o desenvolvimento.
- Abrir o Render alguns minutos antes para acordar o servico gratuito.
