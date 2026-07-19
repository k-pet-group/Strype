# Demo file for visually checking precedence-based operator spacing.
# Paste this into Strype (Ctrl+V into the editor) and look at the gaps around
# operators: tighter-binding operators (., **, unary ~, *, /) should sit close
# to their operands; looser-binding ones (or, and, comparisons, +, -) should
# have more visual space; comma should hug the left side and have space after.

a = 1
b = 2
c = 3
d = 4
e = 5
f = 6
g = 7
h = 8
i = 9
nums = [1, 2, 3, 4, 5]
lookup = {1: "x", 2: "y"}
name = "hello"

# Same-precedence chains should space evenly, no growing gaps
r1 = a+b+c+d+e
r2 = a*b*c*d*e

# Mixed precedence: loosest operator gets the most space
r3 = a+b*c
r4 = a*b+c*d
r5 = a+b*c-d/e

# Comparisons (all one precedence tier) vs arithmetic inside them
r6 = a<b<c
r7 = a+b < c+d
r8 = a==b and c!=d or e>=f

# Boolean operators: or is loosest, and tighter, not tightest of the three
r9 = a and b or c
r10 = (not a) and (not b)
r11 = a or b and c or d

# Membership and identity
r12 = a in nums and b not in nums
r13 = a is b or a is not c

# Bitwise and shifts
r14 = a|b^c&d
r15 = a<<b>>c
r16 = (a|b) ^ (c&d)

# Power and unary
r17 = a**b**c
r18 = (-a)+b*(-c)
r19 = (~a) & b

# Ternary conditional
r20 = a if b>c else d
r21 = (a+b) if (c and d) else (e-f)

# Comprehensions: for/in/if should be tight/uniform, inner expr spaced by its own precedence
r22 = [x for x in nums]
r23 = [x+1 for x in nums if x>2]
r24 = {x for x in nums}
r25 = {x: x*2 for x in nums if x!=3}

# Function calls: commas tight-before/space-after, kwargs '=' with no space
r26 = max(a, b, c)
r27 = pow(a, b, mod=c+d)
r28 = sorted(nums, key=lambda n: -n, reverse=True)

# Nested brackets: each bracket's operators should tier independently
r29 = (a+b)*(c+d)
r30 = ((a+b)*(c+d))/((e-f)*(g+h))

# Slicing and attribute/dot access
r31 = nums[1:3]
r32 = nums[::2]
r33 = name.upper().lower()

# A deliberately busy one mixing most tiers at once
r34 = nums[0]+nums[1] if a in nums and name.upper()!="X" else lookup[1]+lookup[2]

# Mixed-tier chains, deliberately with NO brackets: each of these spans several
# precedence levels in one flat expression, so you should see multiple distinct
# gap sizes within the SAME line, not just one tier per example.
r35 = a or b and c in nums or d==e and f+g*h
r36 = a|b and c^d or e&f
r37 = a<b|c>>d+e*f
r38 = a+b*c-d//e%f**g
r39 = a+b<c-d<e*f
r40 = a or b+c and d*e or f==g
# All 3 real symbol tiers (high/medium/low) in one unbracketed chain:
r41 = a+b*c**d
# The full precedence ladder end to end, strictly loosest to tightest -- shows
# the CSS spacing capping at "low" rather than growing forever as it gets deep:
r42 = a or b and c|d^e&f<<g+h*i
r43 = a and b in nums or not c==d
r44 = a+b*c<d-e/f and g**h>i
