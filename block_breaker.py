import tkinter as tk
import time
from typing import Optional


WIDTH = 800
HEIGHT = 600
PADDLE_WIDTH = 110
WIDE_PADDLE_WIDTH = 165
PADDLE_HEIGHT = 14
BALL_RADIUS = 9
POWERUP_INTERVAL = 5
POWERUP_DURATION = 10.0
POWERUP_SPEED = 3.5
BRICK_ROWS = 5
BRICK_COLUMNS = 10
BRICK_GAP = 6
BRICK_TOP = 80
BRICK_HEIGHT = 24
BRICK_SIDE_MARGIN = 35


class BlockBreaker:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Block Breaker")
        self.root.resizable(False, False)

        self.speed_multiplier = 1.0
        self.speed_choice = tk.DoubleVar(value=self.speed_multiplier)
        menu_bar = tk.Menu(root)
        options_menu = tk.Menu(menu_bar, tearoff=False)
        speed_menu = tk.Menu(options_menu, tearoff=False)
        for label, multiplier in (
            ("Slow (0.7x)", 0.7),
            ("Normal (1.0x)", 1.0),
            ("Fast (1.3x)", 1.3),
        ):
            speed_menu.add_radiobutton(
                label=label,
                variable=self.speed_choice,
                value=multiplier,
                command=lambda value=multiplier: self.set_speed(value),
            )
        options_menu.add_cascade(label="Ball speed", menu=speed_menu)
        menu_bar.add_cascade(label="Options", menu=options_menu)
        self.root.config(menu=menu_bar)

        self.canvas = tk.Canvas(
            root,
            width=WIDTH,
            height=HEIGHT,
            bg="#101827",
            highlightthickness=0,
        )
        self.canvas.pack()
        self.canvas.focus_set()

        self.canvas.bind("<Motion>", self.move_paddle_with_mouse)
        self.canvas.bind("<Button-1>", self.move_paddle_with_mouse)
        self.root.bind("<Left>", self.move_paddle_with_keys)
        self.root.bind("<Right>", self.move_paddle_with_keys)
        self.root.bind("<space>", self.toggle_pause)
        self.root.bind("<Return>", self.start_game)
        self.root.bind("<r>", self.restart_game)
        self.root.bind("<R>", self.restart_game)

        self.brick_colors = ["#ff595e", "#ff924c", "#ffca3a", "#8ac926", "#1982c4"]
        self.reset_game()
        self.tick()

    def reset_game(self) -> None:
        self.score = 0
        self.lives = 3
        self.paused = False
        self.game_over = False
        self.won = False
        self.running = True
        self.broken_bricks = 0
        self.powerups = []
        self.wide_paddle_until = 0.0
        self.paddle_x = WIDTH / 2
        self.paddle_y = HEIGHT - 48
        self.ball_x = WIDTH / 2
        self.ball_y = HEIGHT - 75
        self.ball_dx = 4.0 * self.speed_multiplier
        self.ball_dy = -4.5 * self.speed_multiplier

        usable_width = WIDTH - 2 * BRICK_SIDE_MARGIN
        brick_width = (
            usable_width - (BRICK_COLUMNS - 1) * BRICK_GAP
        ) / BRICK_COLUMNS
        self.bricks = []
        for row in range(BRICK_ROWS):
            for column in range(BRICK_COLUMNS):
                left = BRICK_SIDE_MARGIN + column * (brick_width + BRICK_GAP)
                self.bricks.append(
                    {
                        "left": left,
                        "top": BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP),
                        "right": left + brick_width,
                        "bottom": BRICK_TOP + row * (BRICK_HEIGHT + BRICK_GAP)
                        + BRICK_HEIGHT,
                        "color": self.brick_colors[row],
                    }
                )

    def move_paddle_with_mouse(self, event: tk.Event) -> None:
        self.paddle_x = self.clamp_paddle_x(event.x)

    def move_paddle_with_keys(self, event: tk.Event) -> None:
        if event.keysym == "Left":
            self.paddle_x -= 35
        elif event.keysym == "Right":
            self.paddle_x += 35
        self.paddle_x = self.clamp_paddle_x(self.paddle_x)

    @property
    def paddle_width(self) -> int:
        if time.monotonic() < self.wide_paddle_until:
            return WIDE_PADDLE_WIDTH
        return PADDLE_WIDTH

    def clamp_paddle_x(self, x: float) -> float:
        half_width = self.paddle_width / 2
        return max(half_width, min(WIDTH - half_width, x))

    def set_speed(self, multiplier: float) -> None:
        speed_change = multiplier / self.speed_multiplier
        self.ball_dx *= speed_change
        self.ball_dy *= speed_change
        self.speed_multiplier = multiplier

    def toggle_pause(self, _event: Optional[tk.Event] = None) -> None:
        if not self.game_over:
            self.paused = not self.paused

    def start_game(self, _event: Optional[tk.Event] = None) -> None:
        if self.game_over:
            self.reset_game()
        self.paused = False
        self.running = True

    def restart_game(self, _event: tk.Event | None = None) -> None:
        self.reset_game()

    def update(self) -> None:
        if self.paused or self.game_over:
            return

        now = time.monotonic()
        if now >= self.wide_paddle_until:
            self.wide_paddle_until = 0.0

        self.ball_x += self.ball_dx
        self.ball_y += self.ball_dy

        if self.ball_x - BALL_RADIUS <= 0:
            self.ball_x = BALL_RADIUS
            self.ball_dx = abs(self.ball_dx)
        elif self.ball_x + BALL_RADIUS >= WIDTH:
            self.ball_x = WIDTH - BALL_RADIUS
            self.ball_dx = -abs(self.ball_dx)

        if self.ball_y - BALL_RADIUS <= 0:
            self.ball_y = BALL_RADIUS
            self.ball_dy = abs(self.ball_dy)

        paddle_left = self.paddle_x - self.paddle_width / 2
        paddle_right = self.paddle_x + self.paddle_width / 2
        paddle_top = self.paddle_y - PADDLE_HEIGHT / 2
        paddle_bottom = self.paddle_y + PADDLE_HEIGHT / 2
        if (
            self.ball_dy > 0
            and self.ball_y + BALL_RADIUS >= paddle_top
            and self.ball_y - BALL_RADIUS <= paddle_bottom
            and self.ball_x >= paddle_left
            and self.ball_x <= paddle_right
        ):
            self.ball_y = paddle_top - BALL_RADIUS
            offset = (self.ball_x - self.paddle_x) / (PADDLE_WIDTH / 2)
            self.ball_dx = offset * 5.5 * self.speed_multiplier
            self.ball_dy = (
                -max(3.5, 6.0 - abs(offset * 5.5) * 0.35)
                * self.speed_multiplier
            )

        for brick in self.bricks[:]:
            nearest_x = max(brick["left"], min(self.ball_x, brick["right"]))
            nearest_y = max(brick["top"], min(self.ball_y, brick["bottom"]))
            distance_x = self.ball_x - nearest_x
            distance_y = self.ball_y - nearest_y
            if distance_x * distance_x + distance_y * distance_y > BALL_RADIUS**2:
                continue

            self.bricks.remove(brick)
            self.score += 10
            self.broken_bricks += 1
            if self.broken_bricks % POWERUP_INTERVAL == 0:
                self.powerups.append(
                    {
                        "x": (brick["left"] + brick["right"]) / 2,
                        "y": (brick["top"] + brick["bottom"]) / 2,
                    }
                )
            if abs(distance_x) > abs(distance_y):
                self.ball_dx *= -1
            else:
                self.ball_dy *= -1
            break

        if self.ball_y - BALL_RADIUS > HEIGHT:
            self.lives -= 1
            if self.lives <= 0:
                self.game_over = True
            else:
                self.ball_x = WIDTH / 2
                self.ball_y = HEIGHT - 75
                self.ball_dx = 4.0 * self.speed_multiplier
                self.ball_dy = -4.5 * self.speed_multiplier
                self.paddle_x = WIDTH / 2

        for powerup in self.powerups[:]:
            powerup["y"] += POWERUP_SPEED
            if (
                powerup["y"] + 10 >= paddle_top
                and powerup["y"] - 10 <= paddle_bottom
                and powerup["x"] >= paddle_left
                and powerup["x"] <= paddle_right
            ):
                self.powerups.remove(powerup)
                self.wide_paddle_until = time.monotonic() + POWERUP_DURATION
            elif powerup["y"] - 10 > HEIGHT:
                self.powerups.remove(powerup)

        if not self.bricks:
            self.game_over = True
            self.won = True

    def draw(self) -> None:
        self.canvas.delete("all")

        self.canvas.create_text(
            20,
            24,
            anchor="w",
            text=f"SCORE  {self.score}",
            fill="#f3f4f6",
            font=("Arial", 16, "bold"),
        )
        self.canvas.create_text(
            WIDTH - 20,
            24,
            anchor="e",
            text=f"LIVES  {self.lives}",
            fill="#f3f4f6",
            font=("Arial", 16, "bold"),
        )
        self.canvas.create_line(0, 48, WIDTH, 48, fill="#293548")

        if self.wide_paddle_until > time.monotonic():
            remaining = self.wide_paddle_until - time.monotonic()
            self.canvas.create_text(
                WIDTH / 2,
                24,
                text=f"WIDE PADDLE  {remaining:.1f}s",
                fill="#ffd166",
                font=("Arial", 12, "bold"),
            )

        for brick in self.bricks:
            self.canvas.create_rectangle(
                brick["left"],
                brick["top"],
                brick["right"],
                brick["bottom"],
                fill=brick["color"],
                outline="",
            )

        self.canvas.create_rectangle(
            self.paddle_x - self.paddle_width / 2,
            self.paddle_y - PADDLE_HEIGHT / 2,
            self.paddle_x + self.paddle_width / 2,
            self.paddle_y + PADDLE_HEIGHT / 2,
            fill="#e5e7eb",
            outline="",
        )
        for powerup in self.powerups:
            self.canvas.create_oval(
                powerup["x"] - 10,
                powerup["y"] - 10,
                powerup["x"] + 10,
                powerup["y"] + 10,
                fill="#ffd166",
                outline="#fff3c4",
                width=2,
            )
            self.canvas.create_text(
                powerup["x"],
                powerup["y"],
                text="W",
                fill="#493300",
                font=("Arial", 10, "bold"),
            )
        self.canvas.create_oval(
            self.ball_x - BALL_RADIUS,
            self.ball_y - BALL_RADIUS,
            self.ball_x + BALL_RADIUS,
            self.ball_y + BALL_RADIUS,
            fill="#ffffff",
            outline="",
        )

        self.canvas.create_text(
            WIDTH / 2,
            HEIGHT - 15,
            text="Move: mouse or ←/→     Pause: Space     Restart: R",
            fill="#9ca3af",
            font=("Arial", 10),
        )

        if self.paused:
            self.draw_message("PAUSED", "Press Space to continue")
        elif self.game_over:
            if getattr(self, "won", False):
                self.draw_message("YOU WIN!", "Press Enter or R to play again")
            else:
                self.draw_message("GAME OVER", "Press Enter or R to try again")

    def draw_message(self, title: str, subtitle: str) -> None:
        self.canvas.create_rectangle(
            0, 0, WIDTH, HEIGHT, fill="#000000", stipple="gray50", outline=""
        )
        self.canvas.create_text(
            WIDTH / 2,
            HEIGHT / 2 - 20,
            text=title,
            fill="#ffffff",
            font=("Arial", 32, "bold"),
        )
        self.canvas.create_text(
            WIDTH / 2,
            HEIGHT / 2 + 25,
            text=subtitle,
            fill="#d1d5db",
            font=("Arial", 14),
        )

    def tick(self) -> None:
        self.update()
        self.draw()
        self.root.after(16, self.tick)


def main() -> None:
    root = tk.Tk()
    BlockBreaker(root)
    root.mainloop()


if __name__ == "__main__":
    main()
