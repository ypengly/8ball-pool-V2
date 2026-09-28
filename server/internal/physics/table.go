package physics

type CushionSegment struct {
	A, B   Vector2
	Normal Vector2
}

type Pocket struct {
	ID       int
	Position Vector2
	Radius   float64
}

type Table struct {
	Width, Height float64
	Cushions      []CushionSegment
	Pockets       []Pocket
}

func NewTable() *Table {
	t := &Table{Width: TableWidth, Height: TableHeight}
	t.Pockets = t.buildPockets()
	t.Cushions = t.buildCushions()
	return t
}

func (t *Table) buildPockets() []Pocket {
	w, h, r := t.Width, t.Height, PocketRadius
	return []Pocket{
		{0, Vector2{0, 0}, r},
		{1, Vector2{w / 2, -r * 0.4}, r * 0.85},
		{2, Vector2{w, 0}, r},
		{3, Vector2{w, h}, r},
		{4, Vector2{w / 2, h + r*0.4}, r * 0.85},
		{5, Vector2{0, h}, r},
	}
}

func (t *Table) buildCushions() []CushionSegment {
	w, h := t.Width, t.Height
	inset := PocketRadius * 0.9
	return []CushionSegment{
		{Vector2{inset, 0}, Vector2{w/2 - inset, 0}, Vector2{0, 1}},
		{Vector2{w/2 + inset, 0}, Vector2{w - inset, 0}, Vector2{0, 1}},
		{Vector2{inset, h}, Vector2{w/2 - inset, h}, Vector2{0, -1}},
		{Vector2{w/2 + inset, h}, Vector2{w - inset, h}, Vector2{0, -1}},
		{Vector2{0, inset}, Vector2{0, h - inset}, Vector2{1, 0}},
		{Vector2{w, inset}, Vector2{w, h - inset}, Vector2{-1, 0}},
	}
}
