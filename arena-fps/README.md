# Arena Duelo

FPS 3D simples no navegador: você contra 1 bot numa arena com cobertura. Primeiro a 5 abates vence.

## Jogar

Abra `index.html` no navegador (precisa de internet para carregar o Three.js r128 do cdnjs).

```sh
open index.html
```

## Controles

| Tecla | Ação |
|---|---|
| W / S ou ↑ / ↓ | Andar para frente / trás |
| A / D | Andar de lado |
| Mouse | Mirar (clique na tela para travar o cursor) |
| Clique esquerdo / Espaço | Atirar (segure para rajada) |
| ← / → | Girar pelo teclado (toque curto = mira fina) |
| Shift + ← / → | Andar de lado |
| Esc / P | Pausar |
| Enter | Começar / jogar de novo |

## Arquivos

- `index.html`: HUD e menus
- `style.css`: visual
- `game.js`: cena, física, IA do bot, áudio sintetizado

## IA do bot

- **Patrulha**: anda por pontos aleatórios, com tendência a ir para perto de você.
- **Caça**: ouve seus tiros e vai até a última posição conhecida.
- **Combate**: com linha de visão, encara, anda de lado e mantém distância. Atira depois de um tempo de reação. Erra mais quando você está em movimento.

Dificuldade (Fácil / Normal / Difícil) muda o tempo de reação, a precisão, a cadência, o dano, o giro e a velocidade.
