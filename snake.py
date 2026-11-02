"""뱀 게임 (tkinter 사용, 추가 설치 불필요)

조작: 방향키 또는 WASD로 이동, 스페이스로 일시정지, R로 재시작
"""
import random
import tkinter as tk

CELL = 20          # 칸 크기(픽셀)
COLS, ROWS = 30, 20
SPEED = 120        # 이동 간격(ms), 작을수록 빠름

DIRECTIONS = {
    "Up": (0, -1), "w": (0, -1),
    "Down": (0, 1), "s": (0, 1),
    "Left": (-1, 0), "a": (-1, 0),
    "Right": (1, 0), "d": (1, 0),
}


class SnakeGame:
    def __init__(self, root):
        self.root = root
        root.title("Snake")
        root.resizable(False, False)

        self.score_label = tk.Label(root, font=("Consolas", 14))
        self.score_label.pack()
        self.canvas = tk.Canvas(root, width=COLS * CELL, height=ROWS * CELL,
                                bg="black", highlightthickness=0)
        self.canvas.pack()

        root.bind("<Key>", self.on_key)
        self.after_id = None
        self.reset()

    def reset(self):
        if self.after_id:
            self.root.after_cancel(self.after_id)
        cx, cy = COLS // 2, ROWS // 2
        self.snake = [(cx, cy), (cx - 1, cy), (cx - 2, cy)]
        self.direction = (1, 0)
        self.next_direction = (1, 0)
        self.score = 0
        self.paused = False
        self.game_over = False
        self.place_food()
        self.draw()
        self.tick()

    def place_food(self):
        free = [(x, y) for x in range(COLS) for y in range(ROWS)
                if (x, y) not in self.snake]
        self.food = random.choice(free) if free else None

    def on_key(self, event):
        key = event.keysym
        if key in ("r", "R"):
            self.reset()
        elif key == "space" and not self.game_over:
            self.paused = not self.paused
            self.draw()
        elif key in DIRECTIONS or key.lower() in DIRECTIONS:
            new = DIRECTIONS.get(key) or DIRECTIONS[key.lower()]
            # 반대 방향으로는 바로 꺾을 수 없음
            if (new[0] + self.direction[0], new[1] + self.direction[1]) != (0, 0):
                self.next_direction = new

    def tick(self):
        if not self.paused and not self.game_over:
            self.step()
            self.draw()
        self.after_id = self.root.after(SPEED, self.tick)

    def step(self):
        self.direction = self.next_direction
        hx, hy = self.snake[0]
        head = (hx + self.direction[0], hy + self.direction[1])

        will_eat = head == self.food
        body = self.snake if will_eat else self.snake[:-1]
        out = not (0 <= head[0] < COLS and 0 <= head[1] < ROWS)
        if out or head in body:
            self.game_over = True
            return

        self.snake.insert(0, head)
        if will_eat:
            self.score += 10
            self.place_food()
            if self.food is None:      # 화면을 다 채우면 승리
                self.game_over = True
        else:
            self.snake.pop()

    def draw(self):
        c = self.canvas
        c.delete("all")
        if self.food:
            fx, fy = self.food
            c.create_oval(fx * CELL + 2, fy * CELL + 2,
                          (fx + 1) * CELL - 2, (fy + 1) * CELL - 2, fill="red")
        for i, (x, y) in enumerate(self.snake):
            c.create_rectangle(x * CELL + 1, y * CELL + 1,
                               (x + 1) * CELL - 1, (y + 1) * CELL - 1,
                               fill="lime" if i == 0 else "green", outline="")

        self.score_label.config(text=f"점수: {self.score}")
        mid_x, mid_y = COLS * CELL // 2, ROWS * CELL // 2
        if self.game_over:
            c.create_text(mid_x, mid_y - 15, text="GAME OVER",
                          fill="white", font=("Consolas", 28, "bold"))
            c.create_text(mid_x, mid_y + 20, text="R 키로 재시작",
                          fill="white", font=("Consolas", 14))
        elif self.paused:
            c.create_text(mid_x, mid_y, text="일시정지",
                          fill="white", font=("Consolas", 24, "bold"))


if __name__ == "__main__":
    root = tk.Tk()
    SnakeGame(root)
    root.mainloop()
