package physics

import "math"

// BuildRack mirrors client/src/rules/Rack.ts so a given seed produces the
// identical layout on both sides (needed for the server to validate a
// client's predicted break, and for exact-replay rematches).
func BuildRack(table *Table, seed int64) []*Ball {
	balls := make([]*Ball, 0, 16)
	footSpot := Vector2{table.Width * 0.75, table.Height / 2}
	headSpot := Vector2{table.Width * 0.25, table.Height / 2}

	cue := NewBall(0, 0, BallCue, headSpot)
	balls = append(balls, cue)

	spacing := BallRadius*2 + 0.5
	rowDirX := math.Sqrt(3) / 2

	solids := []int{1, 2, 3, 4, 5, 6, 7}
	stripes := []int{9, 10, 11, 12, 13, 14, 15}
	order := append(append([]int{}, solids...), stripes...)
	order = deterministicShuffle(order, seed)

	type slot struct{ row, col int }
	var slots []slot
	for row := 0; row < 5; row++ {
		for col := 0; col <= row; col++ {
			slots = append(slots, slot{row, col})
		}
	}

	eightSlotIndex := -1
	for i, s := range slots {
		if s.row == 2 && s.col == 1 {
			eightSlotIndex = i
			break
		}
	}

	numbers := make([]int, len(slots))
	cursor := 0
	for i := range slots {
		if i == eightSlotIndex {
			numbers[i] = 8
		} else {
			numbers[i] = order[cursor]
			cursor++
		}
	}

	for i, s := range slots {
		x := footSpot.X + float64(s.row)*rowDirX*spacing
		y := footSpot.Y + (float64(s.col)-float64(s.row)/2)*spacing
		n := numbers[i]
		balls = append(balls, NewBall(n, n, BallTypeForNumber(n), Vector2{x, y}))
	}

	return balls
}

func deterministicShuffle(arr []int, seed int64) []int {
	a := append([]int{}, arr...)
	s := seed
	rnd := func() float64 {
		s = (s*1103515245 + 12345) & 0x7fffffff
		return float64(s) / float64(0x7fffffff)
	}
	for i := len(a) - 1; i > 0; i-- {
		j := int(rnd() * float64(i+1))
		a[i], a[j] = a[j], a[i]
	}
	return a
}
