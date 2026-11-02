"""Sky Striker - 종스크롤 슈팅 게임 (pygame)

조작:
  방향키 / WASD   이동
  Shift           저속 이동 (정밀 회피)
  Z / Space       사격 (누르고 있으면 연사)
  X               폭탄 (화면의 적 탄 제거 + 전체 공격)
  P               일시정지
  M               소리 켜기 / 끄기
  Enter           시작 / 재시작
  Esc             종료

아이템:
  P (파란색)  무기 강화 (최대 3단계)
  B (빨간색)  폭탄 +1 (최대 5개)

약 45초마다 보스가 등장하고, 보스를 쓰러뜨릴수록 난이도가 올라갑니다.
"""
import math
import random
import sys
from array import array
from collections import deque

import pygame

W, H = 480, 720
FPS = 60
TILE = 40
BOSS_INTERVAL = 60 * 45

WHITE = (255, 255, 255)
Vec = pygame.Vector2


def circle_hit(a_pos, a_r, b_pos, b_r):
    return a_pos.distance_squared_to(b_pos) <= (a_r + b_r) ** 2


# ------------------------------------------------------------------ 효과음
class Sounds:
    """효과음을 파일 없이 파형으로 직접 합성한다. 오디오 장치가 없으면 조용히 꺼진다."""

    def __init__(self):
        self.sounds = {}
        self.muted = False
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(22050, -16, 1, 512)
            self.rate, fmt, self.channels = pygame.mixer.get_init()
            if fmt != -16:
                raise pygame.error(f"unsupported sample format {fmt}")
            pygame.mixer.set_num_channels(16)
            self._build()
        except pygame.error as e:
            print("효과음을 사용할 수 없습니다:", e)
            self.sounds = {}

    def _make(self, samples, volume):
        data = array("h")
        for v in samples:
            v = int(max(-1.0, min(1.0, v)) * volume * 32767)
            data.extend((v,) * self.channels)
        return pygame.mixer.Sound(buffer=data.tobytes())

    def _square_sweep(self, dur, f0, f1, decay=2):
        n = int(self.rate * dur)
        phase = 0.0
        for i in range(n):
            p = i / n
            phase += (f0 + (f1 - f0) * p) / self.rate
            yield (1 if phase % 1 < 0.5 else -1) * (1 - p) ** decay

    def _noise(self, dur, smooth, decay=2):
        n = int(self.rate * dur)
        y = 0.0
        for i in range(n):
            y += smooth * (random.uniform(-1, 1) - y)
            yield y * (1 - i / n) ** decay / max(smooth, 0.3)

    def _notes(self, freqs, each):
        for f in freqs:
            n = int(self.rate * each)
            for i in range(n):
                yield (1 if (i * f / self.rate) % 1 < 0.5 else -1) * (1 - i / n) * 0.8

    def _build(self):
        r = self.rate
        self.sounds["shoot"] = self._make(self._square_sweep(0.06, 1400, 700), 0.10)
        self.sounds["explode"] = self._make(self._noise(0.35, 0.5), 0.35)
        self.sounds["big"] = self._make(self._noise(1.4, 0.12, decay=1.5), 0.6)
        hit = [a * 0.6 + b * 0.5 for a, b in zip(self._noise(0.7, 0.25), self._square_sweep(0.7, 300, 60, 1))]
        self.sounds["hit"] = self._make(hit, 0.5)
        n = int(r * 1.1)
        rumble = (math.sin(2 * math.pi * (60 - 30 * i / n) * i / r) * (1 - i / n) for i in range(n))
        self.sounds["bomb"] = self._make([a + b * 0.8 for a, b in zip(rumble, self._noise(1.1, 0.06, 1))], 0.6)
        self.sounds["power"] = self._make(self._notes([523, 659, 784, 1047], 0.07), 0.25)
        self.sounds["warning"] = self._make(self._notes([880, 660] * 4, 0.3), 0.22)
        self.sounds["start"] = self._make(self._notes([392, 523, 659, 784, 1047], 0.08), 0.25)

    def play(self, name):
        if not self.muted and name in self.sounds:
            self.sounds[name].play()


# ------------------------------------------------------------------ 배경
class Background:
    """강이 굽이치는 지형을 무작위로 만들어 아래로 스크롤한다."""

    def __init__(self):
        self.cols = W // TILE
        self.river_x = self.cols / 2
        self.river_w = 2.0
        self.offset = 0.0
        self.speed = 1.5
        self.rows = deque(self._new_row() for _ in range(H // TILE + 2))

    def _new_row(self):
        self.river_x = max(2, min(self.cols - 3, self.river_x + random.uniform(-0.5, 0.5)))
        self.river_w = max(1.0, min(3.0, self.river_w + random.uniform(-0.2, 0.2)))
        row = []
        for c in range(self.cols):
            d = abs(c + 0.5 - self.river_x)
            if d < self.river_w:
                s = random.randint(-8, 8)
                row.append(((30 + s, 70 + s, 130 + s), False))
            elif d < self.river_w + 0.8:
                row.append(((170, 155, 110), False))
            else:
                g = random.randint(-12, 12)
                row.append(((50 + g, 95 + g, 50 + g), random.random() < 0.15))
        return row

    def update(self):
        self.offset += self.speed
        while self.offset >= TILE:
            self.offset -= TILE
            self.rows.pop()
            self.rows.appendleft(self._new_row())

    def draw(self, surf):
        for i, row in enumerate(self.rows):
            y = (i - 1) * TILE + int(self.offset)
            for c, (color, tree) in enumerate(row):
                surf.fill(color, (c * TILE, y, TILE, TILE))
                if tree:
                    pygame.draw.circle(surf, (30, 70, 35), (c * TILE + 20, y + 20), 13)


# ------------------------------------------------------------------ 탄, 파티클, 아이템
class Bullet:
    def __init__(self, pos, vel, radius, color):
        self.pos = Vec(pos)
        self.vel = Vec(vel)
        self.radius = radius
        self.color = color
        self.dead = False

    def update(self):
        self.pos += self.vel
        if not (-20 < self.pos.x < W + 20 and -20 < self.pos.y < H + 20):
            self.dead = True

    def draw(self, surf):
        pygame.draw.circle(surf, self.color, self.pos, self.radius)
        pygame.draw.circle(surf, WHITE, self.pos, max(1, self.radius - 2))


class Particle:
    def __init__(self, pos, vel, life, color, size):
        self.pos = Vec(pos)
        self.vel = Vec(vel)
        self.life = self.max_life = life
        self.color = color
        self.size = size

    def update(self):
        self.pos += self.vel
        self.vel *= 0.94
        self.life -= 1

    def draw(self, surf):
        r = int(self.size * self.life / self.max_life) + 1
        pygame.draw.circle(surf, self.color, self.pos, r)


class Item:
    COLORS = {"P": (70, 150, 255), "B": (240, 80, 80)}

    def __init__(self, pos, kind):
        self.pos = Vec(pos)
        self.vel = Vec(random.uniform(-1, 1), -2)
        self.kind = kind
        self.t = 0
        self.dead = False

    def update(self):
        self.t += 1
        self.vel.y = min(self.vel.y + 0.05, 1.5)
        self.pos += self.vel
        if not 12 < self.pos.x < W - 12:
            self.vel.x *= -1
        if self.pos.y > H + 20:
            self.dead = True

    def draw(self, surf, font):
        r = 12 + 2 * math.sin(self.t * 0.2)
        pygame.draw.circle(surf, self.COLORS[self.kind], self.pos, r)
        pygame.draw.circle(surf, WHITE, self.pos, r, 2)
        img = font.render(self.kind, True, WHITE)
        surf.blit(img, img.get_rect(center=self.pos))


# ------------------------------------------------------------------ 플레이어
class Player:
    RADIUS = 14
    HITBOX = 4

    def __init__(self):
        self.pos = Vec(W / 2, H - 100)
        self.lives = 3
        self.bombs = 3
        self.level = 1
        self.cooldown = 0
        self.invuln = 120

    def update(self, keys, game):
        move = Vec(
            (keys[pygame.K_RIGHT] or keys[pygame.K_d]) - (keys[pygame.K_LEFT] or keys[pygame.K_a]),
            (keys[pygame.K_DOWN] or keys[pygame.K_s]) - (keys[pygame.K_UP] or keys[pygame.K_w]),
        )
        if move.length_squared():
            slow = keys[pygame.K_LSHIFT] or keys[pygame.K_RSHIFT]
            move.scale_to_length(2.5 if slow else 5)
        self.pos += move
        self.pos.x = max(16, min(W - 16, self.pos.x))
        self.pos.y = max(20, min(H - 20, self.pos.y))

        if self.cooldown:
            self.cooldown -= 1
        if self.invuln:
            self.invuln -= 1
        if (keys[pygame.K_z] or keys[pygame.K_SPACE]) and not self.cooldown:
            self.fire(game)
            self.cooldown = 6

    def fire(self, game):
        # 어깨 캐논 2문 + 강화 단계에 따라 머리 위에서 확산탄
        for dx in (-13, 13):
            game.shots.append(Bullet(self.pos + (dx, -18), (0, -12), 3, (255, 230, 80)))
        spreads = {1: [], 2: [10], 3: [10, 20]}[self.level]
        for a in spreads:
            for s in (-1, 1):
                game.shots.append(Bullet(self.pos + (0, -26), Vec(0, -11).rotate(a * s), 3, (255, 160, 60)))
        game.sfx.play("shoot")

    def draw(self, surf):
        if self.invuln and (self.invuln // 4) % 2:
            return
        draw_robot(surf, self.pos)


ROBOT_BODY = (225, 230, 240)
ROBOT_ACCENT = (240, 140, 40)
ROBOT_DARK = (55, 65, 90)
ROBOT_VISOR = (80, 230, 160)


def draw_robot(surf, pos, flames=True):
    """플레이어 기체: 흰색·주황색 오리지널 거대 로봇 (외뿔, 녹색 바이저, 어깨 캐논)."""
    x, y = pos
    if flames:  # 발바닥 추진기
        for fx in (-6, 6):
            f = random.randint(6, 12)
            pygame.draw.polygon(surf, (255, 150, 40), [(x + fx - 3, y + 16), (x + fx + 3, y + 16), (x + fx, y + 16 + f)])
            pygame.draw.polygon(surf, (255, 240, 150), [(x + fx - 1.5, y + 16), (x + fx + 1.5, y + 16), (x + fx, y + 16 + f / 2)])
    for lx in (-9, 3):  # 다리
        pygame.draw.rect(surf, ROBOT_BODY, (x + lx, y + 6, 6, 11), border_radius=2)
        pygame.draw.rect(surf, ROBOT_DARK, (x + lx, y + 6, 6, 11), 1, border_radius=2)
    for s in (-1, 1):  # 팔, 어깨, 어깨 캐논
        pygame.draw.rect(surf, ROBOT_DARK, (x + s * 13 - 2, y - 17, 4, 9))
        pygame.draw.rect(surf, ROBOT_BODY, (x + s * 13 - 3, y - 4, 6, 14), border_radius=2)
        pygame.draw.rect(surf, ROBOT_DARK, (x + s * 13 - 3, y - 4, 6, 14), 1, border_radius=2)
        pygame.draw.circle(surf, ROBOT_ACCENT, (x + s * 13, y - 6), 6)
        pygame.draw.circle(surf, ROBOT_DARK, (x + s * 13, y - 6), 6, 1)
    pygame.draw.rect(surf, ROBOT_BODY, (x - 9, y - 10, 18, 18), border_radius=4)  # 몸통
    pygame.draw.rect(surf, ROBOT_DARK, (x - 9, y - 10, 18, 18), 2, border_radius=4)
    pygame.draw.circle(surf, ROBOT_ACCENT, (x, y - 1), 4)  # 동력 코어
    pygame.draw.circle(surf, (255, 230, 170), (x, y - 1), 2)
    pygame.draw.rect(surf, ROBOT_BODY, (x - 6, y - 21, 12, 11), border_radius=3)  # 머리
    pygame.draw.rect(surf, ROBOT_DARK, (x - 6, y - 21, 12, 11), 1, border_radius=3)
    pygame.draw.rect(surf, ROBOT_VISOR, (x - 4, y - 18, 8, 3))  # 바이저
    pygame.draw.polygon(surf, ROBOT_ACCENT, [(x, y - 29), (x + 2, y - 21), (x - 2, y - 21)])  # 외뿔


# ------------------------------------------------------------------ 적
class Enemy:
    radius = 14
    max_hp = 1
    score = 100
    drop = 0.05
    color = (230, 80, 80)

    def __init__(self, pos):
        self.pos = Vec(pos)
        self.hp = self.max_hp
        self.t = 0
        self.flash = 0
        self.dead = False

    def update(self, game):
        self.t += 1
        if self.flash:
            self.flash -= 1
        self.move(game)
        if self.pos.y > H + 60 or not -80 < self.pos.x < W + 80:
            self.dead = True  # 화면 밖으로 사라짐 (점수 없음)

    def hit(self, dmg):
        self.hp -= dmg
        self.flash = 4
        return self.hp <= 0

    def body_color(self):
        return WHITE if self.flash else self.color

    def move(self, game):
        raise NotImplementedError

    def draw(self, surf):
        raise NotImplementedError


class Drone(Enemy):
    """곧장 내려오며 한 번 조준탄을 쏜다."""

    def __init__(self, pos):
        super().__init__(pos)
        self.fire_at = random.randint(30, 90)

    def move(self, game):
        self.pos.y += 3.2
        if self.t == self.fire_at and self.pos.y < H * 0.6:
            game.enemy_fire(self.pos, game.aim(self.pos, game.bullet_speed(3.5)))

    def draw(self, surf):
        x, y = self.pos
        pygame.draw.polygon(surf, self.body_color(), [(x, y + 14), (x + 14, y), (x, y - 10), (x - 14, y)])
        pygame.draw.circle(surf, (60, 20, 20), (x, y + 2), 4)


class Weaver(Enemy):
    """좌우로 흔들리며 내려온다."""
    radius = 13
    max_hp = 2
    score = 150
    drop = 0.07
    color = (170, 90, 230)

    def __init__(self, pos, amp=70):
        super().__init__(pos)
        self.x0 = pos[0]
        self.amp = amp

    def move(self, game):
        self.pos.y += 2.4
        self.pos.x = self.x0 + math.sin(self.t * 0.05) * self.amp
        if self.t % 90 == 45:
            game.enemy_fire(self.pos, game.aim(self.pos, game.bullet_speed(3.2)))

    def draw(self, surf):
        x, y = self.pos
        c = self.body_color()
        pygame.draw.polygon(surf, c, [(x - 18, y - 6), (x, y + 4), (x + 18, y - 6), (x, y + 12)])
        pygame.draw.circle(surf, c, (x, y), 9)
        pygame.draw.circle(surf, (40, 20, 60), (x, y), 4)


class Gunner(Enemy):
    """멈춰 서서 3방향 조준탄을 쏘다가 떠난다."""
    radius = 20
    max_hp = 10
    score = 400
    drop = 0.35
    color = (220, 170, 60)

    def __init__(self, pos):
        super().__init__(pos)
        self.stop_y = random.uniform(90, 240)
        self.aim_dir = Vec(0, 1)

    def move(self, game):
        self.aim_dir = game.aim(self.pos, 1)
        if self.t < 240:
            self.pos.y += (self.stop_y - self.pos.y) * 0.04
            if self.t > 60 and self.t % 50 == 0:
                for a in (-15, 0, 15):
                    game.enemy_fire(self.pos, game.aim(self.pos, game.bullet_speed(3.0), a), (255, 200, 80))
        else:
            self.pos.y += 2

    def draw(self, surf):
        x, y = self.pos
        pygame.draw.rect(surf, self.body_color(), (x - 18, y - 15, 36, 30), border_radius=6)
        pygame.draw.rect(surf, (90, 70, 30), (x - 18, y - 15, 36, 30), 2, border_radius=6)
        pygame.draw.line(surf, (60, 60, 60), self.pos, self.pos + self.aim_dir * 24, 6)
        pygame.draw.circle(surf, (120, 90, 40), (x, y), 8)


class Boss(Enemy):
    radius = 52
    color = (130, 140, 160)
    drop = 0

    def __init__(self, pos, n):
        super().__init__(pos)
        self.n = n
        self.max_hp = self.hp = 180 + 90 * n
        self.score = 5000 * (n + 1)
        self.active = 0

    def move(self, game):
        if self.pos.y < 150:  # 등장 중
            self.pos.y += 1.5
            return
        self.active += 1
        a = self.active
        self.pos.x = W / 2 + math.sin(a * 0.012) * 140
        spd = game.bullet_speed
        pattern = (a // 240) % 3
        if pattern == 0 and a % 45 == 0:  # 원형 탄막
            k = 14 + 2 * self.n
            for i in range(k):
                game.enemy_fire(self.pos, Vec(0, spd(3)).rotate(360 * i / k + a), (255, 200, 80))
        elif pattern == 1 and a % 28 == 0:  # 부채꼴 조준탄
            for ang in range(-30, 31, 15):
                game.enemy_fire(self.pos, game.aim(self.pos, spd(4.2), ang), (120, 220, 255))
        elif pattern == 2 and a % 6 == 0:  # 회전 탄막
            arms = 2 + self.n % 2
            for arm in range(arms):
                game.enemy_fire(self.pos, Vec(0, spd(3.2)).rotate(a * 6 + arm * 360 / arms), (255, 110, 200))

    def draw(self, surf):
        x, y = self.pos
        hull = [(x - 70, y - 10), (x - 40, y - 35), (x + 40, y - 35),
                (x + 70, y - 10), (x + 50, y + 30), (x - 50, y + 30)]
        pygame.draw.polygon(surf, self.body_color(), hull)
        pygame.draw.polygon(surf, (60, 65, 80), hull, 3)
        for dx in (-45, 45):
            pygame.draw.rect(surf, (90, 95, 110), (x + dx - 8, y + 20, 16, 22))
        r = 14 + 3 * math.sin(self.t * 0.2)
        pygame.draw.circle(surf, (255, 60, 60), (x, y), r)
        pygame.draw.circle(surf, WHITE, (x, y), r / 2)


# ------------------------------------------------------------------ 게임
class Game:
    def __init__(self):
        pygame.mixer.pre_init(22050, -16, 1, 512)  # 효과음 지연을 줄이기 위해 작은 버퍼
        pygame.init()
        self.sfx = Sounds()
        self.screen = pygame.display.set_mode((W, H))
        pygame.display.set_caption("Sky Striker")
        self.clock = pygame.time.Clock()
        self.font = pygame.font.SysFont("consolas", 20, bold=True)
        self.small = pygame.font.SysFont("consolas", 16, bold=True)
        self.big = pygame.font.SysFont("consolas", 44, bold=True)
        self.world = pygame.Surface((W, H))
        self.flash_surf = pygame.Surface((W, H))
        self.flash_surf.fill(WHITE)
        self.bg = Background()
        self.hi = 0
        self.state = "title"
        self.new_game()

    def new_game(self):
        self.player = Player()
        self.shots, self.bullets, self.enemies = [], [], []
        self.items, self.particles, self.pending = [], [], []
        self.frame = 0
        self.score = 0
        self.wave_timer = 90
        self.boss = None
        self.boss_count = 0
        self.boss_at = BOSS_INTERVAL
        self.warning = 0
        self.bomb_flash = 0
        self.shake = 0

    # --- 도우미
    @property
    def difficulty(self):
        return 1 + self.frame / (60 * 90) + self.boss_count * 0.3

    def bullet_speed(self, base):
        return base * min(1.7, 0.85 + 0.15 * self.difficulty)

    def aim(self, pos, speed, angle=0):
        d = self.player.pos - pos
        if not d.length_squared():
            d = Vec(0, 1)
        return d.normalize().rotate(angle) * speed

    def enemy_fire(self, pos, vel, color=(255, 90, 160)):
        self.bullets.append(Bullet(pos, vel, 5, color))

    def explode(self, pos, n=16, color=(255, 180, 60), speed=4):
        for _ in range(n):
            v = Vec(random.uniform(0.5, speed), 0).rotate(random.uniform(0, 360))
            self.particles.append(Particle(pos, v, random.randint(20, 40), color, random.randint(2, 5)))
        for _ in range(n // 3):
            v = Vec(random.uniform(0.5, speed), 0).rotate(random.uniform(0, 360))
            self.particles.append(Particle(pos, v, random.randint(15, 30), (255, 240, 200), 3))

    def schedule(self, delay, factory):
        self.pending.append([self.frame + delay, factory])

    # --- 적 편대
    def spawn_wave(self):
        kind = random.choices(["drones", "weavers", "gunner", "mixed"], [3, 3, 2, 2])[0]
        if kind == "drones":  # V자 편대
            n = random.randint(4, 6)
            cx = random.uniform(130, W - 130)
            for i in range(n):
                off = i - (n - 1) / 2
                x = max(20, min(W - 20, cx + off * 45))
                self.schedule(int(abs(off) * 10), lambda x=x: Drone((x, -30)))
        elif kind == "weavers":  # 한 줄로 흔들리며
            x0 = random.uniform(100, W - 100)
            for i in range(6):
                self.schedule(i * 14, lambda: Weaver((x0, -30)))
        elif kind == "gunner":
            for x in random.sample([W * 0.25, W * 0.5, W * 0.75], random.randint(1, 2)):
                self.schedule(0, lambda x=x: Gunner((x, -30)))
        else:  # 포대 + 양옆 드론
            self.schedule(0, lambda: Gunner((W / 2, -30)))
            for i in range(4):
                self.schedule(30 + i * 12, lambda: Drone((60, -30)))
                self.schedule(30 + i * 12, lambda: Drone((W - 60, -30)))

    # --- 전투 처리
    def kill(self, e):
        e.dead = True
        self.score += e.score
        if e is self.boss:
            self.sfx.play("big")
            self.explode(e.pos, 80, (255, 160, 60), 8)
            self.boss = None
            self.boss_count += 1
            self.boss_at = self.frame + BOSS_INTERVAL
            self.shake = 30
            self.bullets.clear()
            self.items += [Item(e.pos + (-30, 0), "P"), Item(e.pos + (30, 0), "B")]
        else:
            self.sfx.play("explode")
            self.explode(e.pos, 18, e.color)
            if random.random() < e.drop:
                self.items.append(Item(e.pos, "P" if random.random() < 0.75 else "B"))

    def player_hit(self):
        p = self.player
        self.sfx.play("hit")
        self.explode(p.pos, 40, (255, 220, 120), 6)
        self.shake = 20
        p.lives -= 1
        if p.lives < 0:
            self.state = "over"
            self.hi = max(self.hi, self.score)
            return
        p.level = max(1, p.level - 1)
        p.bombs = max(p.bombs, 2)
        p.invuln = 150
        p.pos.update(W / 2, H - 100)
        self.bullets.clear()

    def use_bomb(self):
        p = self.player
        if p.bombs <= 0 or self.bomb_flash:
            return
        p.bombs -= 1
        p.invuln = max(p.invuln, 60)
        self.sfx.play("bomb")
        self.bomb_flash = 30
        self.shake = 12
        for b in self.bullets:
            self.explode(b.pos, 2, (255, 120, 200), 2)
        self.bullets.clear()
        for e in self.enemies:
            if not e.dead and e.hit(30 if e is self.boss else 99):
                self.kill(e)

    def pick(self, item):
        p = self.player
        self.sfx.play("power")
        if item.kind == "P":
            if p.level < 3:
                p.level += 1
            else:
                self.score += 1000
        else:
            p.bombs = min(p.bombs + 1, 5)

    # --- 프레임 갱신
    def update_effects(self):
        self.bg.update()
        for pt in self.particles:
            pt.update()
        self.particles = [pt for pt in self.particles if pt.life > 0]
        if self.shake:
            self.shake -= 1
        if self.bomb_flash:
            self.bomb_flash -= 1

    def update(self):
        self.frame += 1
        self.update_effects()
        self.player.update(pygame.key.get_pressed(), self)

        # 보스 경고 → 등장, 보스가 없을 때만 일반 편대 출현
        if self.boss is None and not self.warning and self.frame >= self.boss_at:
            self.warning = 150
            self.sfx.play("warning")
        if self.warning:
            self.warning -= 1
            if not self.warning:
                self.boss = Boss((W / 2, -80), self.boss_count)
                self.enemies.append(self.boss)
        elif self.boss is None:
            self.wave_timer -= 1
            if self.wave_timer <= 0:
                self.spawn_wave()
                self.wave_timer = int(random.randint(100, 160) / self.difficulty)

        for p in self.pending[:]:
            if self.frame >= p[0]:
                self.enemies.append(p[1]())
                self.pending.remove(p)

        for e in self.enemies:
            e.update(self)
        for b in self.shots + self.bullets:
            b.update()
        for it in self.items:
            it.update()

        # 내 탄 → 적
        for s in self.shots:
            for e in self.enemies:
                if not e.dead and circle_hit(s.pos, s.radius, e.pos, e.radius):
                    s.dead = True
                    if e.hit(1):
                        self.kill(e)
                    break

        # 적 탄 / 적 몸체 → 플레이어
        p = self.player
        if not p.invuln:
            hit = any(circle_hit(b.pos, b.radius, p.pos, p.HITBOX) for b in self.bullets)
            for e in self.enemies:
                if not e.dead and circle_hit(e.pos, e.radius * 0.8, p.pos, p.HITBOX):
                    hit = True
                    if e is not self.boss and e.hit(99):
                        self.kill(e)
            if hit:
                self.player_hit()

        # 아이템 획득
        for it in self.items:
            if circle_hit(it.pos, 12, p.pos, p.RADIUS):
                it.dead = True
                self.pick(it)

        self.shots = [s for s in self.shots if not s.dead]
        self.bullets = [b for b in self.bullets if not b.dead]
        self.enemies = [e for e in self.enemies if not e.dead]
        self.items = [it for it in self.items if not it.dead]

    # --- 그리기
    def text(self, s, font, color, shadow=True, **pos):
        img = font.render(s, True, color)
        rect = img.get_rect(**pos)
        if shadow:
            self.screen.blit(font.render(s, True, (0, 0, 0)), rect.move(2, 2))
        self.screen.blit(img, rect)

    def draw(self):
        w = self.world
        self.bg.draw(w)
        for it in self.items:
            it.draw(w, self.small)
        for e in self.enemies:
            e.draw(w)
        if self.state in ("play", "pause"):
            self.player.draw(w)
        for b in self.shots + self.bullets:
            b.draw(w)
        for pt in self.particles:
            pt.draw(w)
        if self.bomb_flash:
            self.flash_surf.set_alpha(self.bomb_flash * 6)
            w.blit(self.flash_surf, (0, 0))

        s = self.shake
        offset = (random.randint(-s, s), random.randint(-s, s)) if s else (0, 0)
        self.screen.fill((0, 0, 0))
        self.screen.blit(w, offset)

        if self.state == "title":
            self.draw_title()
        else:
            self.draw_hud()
            if self.state == "pause":
                self.text("PAUSED", self.big, WHITE, center=(W / 2, H / 2))
            elif self.state == "over":
                self.text("GAME OVER", self.big, (255, 90, 90), center=(W / 2, H / 2 - 40))
                self.text(f"SCORE {self.score}", self.font, WHITE, center=(W / 2, H / 2 + 10))
                self.text("Press ENTER to retry", self.font, WHITE, center=(W / 2, H / 2 + 50))
        pygame.display.flip()

    def draw_hud(self):
        p = self.player
        self.text(f"SCORE {self.score}", self.font, WHITE, topleft=(10, 8))
        self.text(f"HI {max(self.hi, self.score)}", self.font, WHITE, topright=(W - 10, 8))
        for i in range(max(0, p.lives)):  # 남은 목숨: 로봇 머리 아이콘
            x, y = 16 + i * 22, H - 26
            pygame.draw.rect(self.screen, ROBOT_BODY, (x, y, 14, 13), border_radius=3)
            pygame.draw.rect(self.screen, ROBOT_VISOR, (x + 2, y + 4, 10, 3))
            pygame.draw.polygon(self.screen, ROBOT_ACCENT, [(x + 7, y - 7), (x + 9, y), (x + 5, y)])
        if self.sfx.muted:
            self.text("MUTE", self.small, (255, 200, 120), bottomright=(W - 10, H - 32))
        self.text(f"PWR {p.level}  BOMB {p.bombs}", self.font, WHITE, bottomright=(W - 10, H - 8))

        if self.boss:
            ratio = max(0, self.boss.hp / self.boss.max_hp)
            pygame.draw.rect(self.screen, (60, 20, 20), (40, 36, W - 80, 10))
            pygame.draw.rect(self.screen, (255, 70, 70), (40, 36, (W - 80) * ratio, 10))
            pygame.draw.rect(self.screen, WHITE, (40, 36, W - 80, 10), 1)
        if self.warning and (self.warning // 15) % 2:
            self.text("WARNING", self.big, (255, 60, 60), center=(W / 2, H / 2 - 60))
            self.text("BOSS APPROACHING", self.font, (255, 200, 200), center=(W / 2, H / 2 - 20))

    def draw_title(self):
        self.text("SKY STRIKER", self.big, (255, 220, 90), center=(W / 2, H / 3))
        lines = [
            "Arrows / WASD : move",
            "Shift         : slow move",
            "Z / Space     : shoot",
            "X             : bomb",
            "P             : pause",
            "M             : sound on/off",
        ]
        draw_robot(self.screen, (W / 2, H / 3 + 70))
        for i, line in enumerate(lines):
            self.text(line, self.font, WHITE, midleft=(W / 2 - 130, H / 2 + i * 28))
        if (pygame.time.get_ticks() // 500) % 2:
            self.text("Press ENTER to start", self.font, (255, 220, 90), center=(W / 2, H * 0.8))
        if self.hi:
            self.text(f"HI SCORE {self.hi}", self.font, WHITE, center=(W / 2, H * 0.8 + 36))

    # --- 메인 루프
    def run(self):
        while True:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    return
                if event.type != pygame.KEYDOWN:
                    continue
                if event.key == pygame.K_ESCAPE:
                    return
                if event.key == pygame.K_m:
                    self.sfx.muted = not self.sfx.muted
                elif self.state in ("title", "over") and event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
                    self.new_game()
                    self.state = "play"
                    self.sfx.play("start")
                elif self.state == "play":
                    if event.key == pygame.K_x:
                        self.use_bomb()
                    elif event.key == pygame.K_p:
                        self.state = "pause"
                elif self.state == "pause" and event.key == pygame.K_p:
                    self.state = "play"

            if self.state == "play":
                self.update()
            elif self.state in ("title", "over"):
                self.update_effects()
            self.draw()
            self.clock.tick(FPS)


if __name__ == "__main__":
    Game().run()
    pygame.quit()
    sys.exit()
