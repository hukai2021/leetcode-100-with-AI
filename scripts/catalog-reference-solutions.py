"""Locally authored reference solutions for validation, not official solutions.

These implementations are used to check the publicly sourced example values and
exercise the real runner. Passing examples is not a proof of correctness.
They are intentionally separate from the student's initial code templates.
"""
from __future__ import annotations
import ast
import json
from pathlib import Path

def p1(self, nums, target):
    seen = {}
    for i, value in enumerate(nums):
        if target-value in seen: return [seen[target-value], i]
        seen[value] = i
    return []

def p49(self, strs):
    groups = defaultdict(list)
    for word in strs: groups[''.join(sorted(word))].append(word)
    return list(groups.values())

def p128(self, nums):
    values = set(nums)
    best = 0
    for x in values:
        if x-1 not in values:
            y = x
            while y in values: y += 1
            best = max(best, y-x)
    return best

def p283(self, nums):
    nonzero = [x for x in nums if x != 0]
    nums[:] = nonzero + [0]*(len(nums)-len(nonzero))

def p11(self, height):
    left, right, best = 0, len(height)-1, 0
    while left < right:
        best = max(best, (right-left)*min(height[left],height[right]))
        if height[left] < height[right]: left += 1
        else: right -= 1
    return best

def p15(self, nums):
    nums.sort(); result=[]
    for i in range(len(nums)-2):
        if i and nums[i] == nums[i-1]: continue
        left, right = i+1, len(nums)-1
        while left < right:
            total = nums[i]+nums[left]+nums[right]
            if total < 0: left += 1
            elif total > 0: right -= 1
            else:
                result.append([nums[i],nums[left],nums[right]])
                left += 1; right -= 1
                while left < right and nums[left] == nums[left-1]: left += 1
                while left < right and nums[right] == nums[right+1]: right -= 1
    return result

def p42(self, height):
    left, right, lm, rm, result = 0, len(height)-1, 0, 0, 0
    while left <= right:
        if lm <= rm:
            lm = max(lm,height[left]); result += lm-height[left]; left += 1
        else:
            rm = max(rm,height[right]); result += rm-height[right]; right -= 1
    return result

def p3(self, s):
    last={}; left=best=0
    for right,ch in enumerate(s):
        left=max(left,last.get(ch,-1)+1); last[ch]=right
        best=max(best,right-left+1)
    return best

def p438(self, s, p):
    need=Counter(p); have=Counter(); answer=[]
    for i,ch in enumerate(s):
        have[ch]+=1
        if i>=len(p):
            old=s[i-len(p)]; have[old]-=1
            if not have[old]: del have[old]
        if have==need: answer.append(i-len(p)+1)
    return answer

def p560(self, nums, k):
    counts=Counter({0:1}); total=result=0
    for value in nums:
        total+=value; result+=counts[total-k]; counts[total]+=1
    return result

def p239(self, nums, k):
    q=deque(); answer=[]
    for i,value in enumerate(nums):
        while q and q[0]<=i-k: q.popleft()
        while q and nums[q[-1]]<=value: q.pop()
        q.append(i)
        if i>=k-1: answer.append(nums[q[0]])
    return answer

def p76(self, s, t):
    need=Counter(t); missing=len(t); left=0; best=(0,len(s)+1)
    for right,ch in enumerate(s):
        if need[ch]>0: missing-=1
        need[ch]-=1
        while missing==0:
            if right-left+1<best[1]-best[0]: best=(left,right+1)
            need[s[left]]+=1
            if need[s[left]]>0: missing+=1
            left+=1
    return s[best[0]:best[1]] if best[1]<=len(s) else ''

def p53(self, nums):
    best=current=nums[0]
    for value in nums[1:]:
        current=max(value,current+value); best=max(best,current)
    return best

def p56(self, intervals):
    result=[]
    for start,end in sorted(intervals):
        if result and start<=result[-1][1]: result[-1][1]=max(result[-1][1],end)
        else: result.append([start,end])
    return result

def p189(self, nums, k):
    k%=len(nums)
    if k: nums[:]=nums[-k:]+nums[:-k]

def p238(self, nums):
    answer=[1]*len(nums); product=1
    for i,x in enumerate(nums): answer[i]=product; product*=x
    product=1
    for i in range(len(nums)-1,-1,-1): answer[i]*=product; product*=nums[i]
    return answer

def p41(self, nums):
    n=len(nums)
    for i in range(n):
        while 1<=nums[i]<=n and nums[nums[i]-1]!=nums[i]:
            target=nums[i]-1; nums[i],nums[target]=nums[target],nums[i]
    for i,x in enumerate(nums):
        if x!=i+1: return i+1
    return n+1

def p73(self, matrix):
    rows=set(); cols=set()
    for i,row in enumerate(matrix):
        for j,value in enumerate(row):
            if value==0: rows.add(i); cols.add(j)
    for i,row in enumerate(matrix):
        for j in range(len(row)):
            if i in rows or j in cols: row[j]=0

def p54(self, matrix):
    answer=[]
    while matrix:
        answer.extend(matrix.pop(0))
        matrix=[list(row) for row in zip(*matrix)][::-1]
    return answer

def p48(self, matrix):
    matrix[:]=[list(row) for row in zip(*matrix[::-1])]

def p240(self, matrix, target):
    i,j=0,len(matrix[0])-1
    while i<len(matrix) and j>=0:
        if matrix[i][j]==target: return True
        if matrix[i][j]>target: j-=1
        else: i+=1
    return False

def p160(self, headA, headB):
    a,b=headA,headB
    while a is not b:
        a=a.next if a else headB
        b=b.next if b else headA
    return a

def p206(self, head):
    previous=None
    while head:
        nxt=head.next; head.next=previous; previous=head; head=nxt
    return previous

def p234(self, head):
    values=[]
    while head: values.append(head.val); head=head.next
    return values==values[::-1]

def p141(self, head):
    slow=fast=head
    while fast and fast.next:
        slow=slow.next; fast=fast.next.next
        if slow is fast: return True
    return False

def p142(self, head):
    slow=fast=head
    while fast and fast.next:
        slow=slow.next; fast=fast.next.next
        if slow is fast:
            cursor=head
            while cursor is not slow: cursor=cursor.next; slow=slow.next
            return cursor
    return None

def p21(self, list1, list2):
    dummy=tail=ListNode()
    while list1 and list2:
        if list1.val<=list2.val: tail.next=list1; list1=list1.next
        else: tail.next=list2; list2=list2.next
        tail=tail.next
    tail.next=list1 or list2
    return dummy.next

def p2(self, l1, l2):
    dummy=tail=ListNode(); carry=0
    while l1 or l2 or carry:
        total=carry+(l1.val if l1 else 0)+(l2.val if l2 else 0)
        carry,value=divmod(total,10); tail.next=ListNode(value); tail=tail.next
        l1=l1.next if l1 else None; l2=l2.next if l2 else None
    return dummy.next

def p19(self, head, n):
    dummy=ListNode(0,head); fast=slow=dummy
    for _ in range(n): fast=fast.next
    while fast.next: fast=fast.next; slow=slow.next
    slow.next=slow.next.next
    return dummy.next

def p24(self, head):
    dummy=ListNode(0,head); before=dummy
    while before.next and before.next.next:
        a=before.next; b=a.next; a.next=b.next; b.next=a; before.next=b; before=a
    return dummy.next

def p25(self, head, k):
    dummy=ListNode(0,head); before=dummy
    while True:
        last=before
        for _ in range(k):
            last=last.next
            if last is None: return dummy.next
        after=last.next; start=before.next; previous=after; cur=start
        while cur is not after:
            nxt=cur.next; cur.next=previous; previous=cur; cur=nxt
        before.next=last; before=start

def p138(self, head):
    copies={None:None}; cur=head
    while cur: copies[cur]=Node(cur.val); cur=cur.next
    cur=head
    while cur:
        copies[cur].next=copies[cur.next]; copies[cur].random=copies[cur.random]; cur=cur.next
    return copies[head]

def p148(self, head):
    def merge(a,b):
        dummy=tail=ListNode()
        while a and b:
            if a.val<=b.val: tail.next=a; a=a.next
            else: tail.next=b; b=b.next
            tail=tail.next
        tail.next=a or b; return dummy.next
    def sort(node):
        if node is None or node.next is None: return node
        slow,fast=node,node.next
        while fast and fast.next: slow=slow.next; fast=fast.next.next
        right=slow.next; slow.next=None
        return merge(sort(node),sort(right))
    return sort(head)

def p23(self, lists):
    heap=[]; counter=itertools.count()
    for node in lists:
        if node: heappush(heap,(node.val,next(counter),node))
    dummy=tail=ListNode()
    while heap:
        _,_,node=heappop(heap); tail.next=node; tail=node
        if node.next: heappush(heap,(node.next.val,next(counter),node.next))
    return dummy.next

class LRUCache:
    def __init__(self, capacity): self.capacity=capacity; self.data=OrderedDict()
    def get(self,key):
        if key not in self.data: return -1
        self.data.move_to_end(key); return self.data[key]
    def put(self,key,value):
        self.data[key]=value; self.data.move_to_end(key)
        if len(self.data)>self.capacity: self.data.popitem(last=False)

def p94(self, root):
    result=[]; stack=[]
    while stack or root:
        while root: stack.append(root); root=root.left
        root=stack.pop(); result.append(root.val); root=root.right
    return result

def p104(self, root):
    if root is None: return 0
    q=deque([root]); depth=0
    while q:
        for _ in range(len(q)):
            node=q.popleft()
            if node.left: q.append(node.left)
            if node.right: q.append(node.right)
        depth+=1
    return depth

def p226(self, root):
    def visit(node):
        if node:
            node.left,node.right=visit(node.right),visit(node.left)
        return node
    return visit(root)

def p101(self, root):
    def same(a,b):
        if not a or not b: return a is b
        return a.val==b.val and same(a.left,b.right) and same(a.right,b.left)
    return not root or same(root.left,root.right)

def p543(self, root):
    best=0
    def depth(node):
        nonlocal best
        if not node: return 0
        left=depth(node.left); right=depth(node.right); best=max(best,left+right)
        return max(left,right)+1
    depth(root); return best

def p102(self, root):
    if not root: return []
    q=deque([root]); result=[]
    while q:
        row=[]
        for _ in range(len(q)):
            node=q.popleft(); row.append(node.val)
            if node.left: q.append(node.left)
            if node.right: q.append(node.right)
        result.append(row)
    return result

def p108(self, nums):
    def build(left,right):
        if left>=right: return None
        mid=(left+right)//2
        return TreeNode(nums[mid],build(left,mid),build(mid+1,right))
    return build(0,len(nums))

def p98(self, root):
    def valid(node,low,high):
        if node is None: return True
        return low<node.val<high and valid(node.left,low,node.val) and valid(node.right,node.val,high)
    return valid(root,float('-inf'),float('inf'))

def p230(self, root, k):
    stack=[]
    while stack or root:
        while root: stack.append(root); root=root.left
        root=stack.pop(); k-=1
        if k==0: return root.val
        root=root.right

def p199(self, root):
    if not root: return []
    q=deque([root]); result=[]
    while q:
        for _ in range(len(q)):
            node=q.popleft()
            if node.left: q.append(node.left)
            if node.right: q.append(node.right)
        result.append(node.val)
    return result

def p114(self, root):
    if not root: return
    stack=[root]; previous=None
    while stack:
        node=stack.pop()
        if previous: previous.left=None; previous.right=node
        if node.right: stack.append(node.right)
        if node.left: stack.append(node.left)
        previous=node
    previous.left=previous.right=None

def p105(self, preorder, inorder):
    where={value:i for i,value in enumerate(inorder)}; cursor=iter(preorder)
    def build(left,right):
        if left>=right: return None
        value=next(cursor); mid=where[value]
        return TreeNode(value,build(left,mid),build(mid+1,right))
    return build(0,len(inorder))

def p437(self, root, targetSum):
    counts=Counter({0:1})
    def visit(node,total):
        if not node: return 0
        total+=node.val; answer=counts[total-targetSum]; counts[total]+=1
        answer+=visit(node.left,total)+visit(node.right,total); counts[total]-=1
        return answer
    return visit(root,0)

def p236(self, root, p, q):
    def ancestor(node):
        if node is None or node is p or node is q: return node
        left=ancestor(node.left); right=ancestor(node.right)
        return node if left and right else left or right
    return ancestor(root)

def p124(self, root):
    best=float('-inf')
    def gain(node):
        nonlocal best
        if not node: return 0
        left=max(0,gain(node.left)); right=max(0,gain(node.right))
        best=max(best,node.val+left+right)
        return node.val+max(left,right)
    gain(root); return best

def p200(self, grid):
    m,n=len(grid),len(grid[0]); seen=set(); result=0
    for i in range(m):
        for j in range(n):
            if grid[i][j]!='1' or (i,j) in seen: continue
            result+=1; stack=[(i,j)]; seen.add((i,j))
            while stack:
                x,y=stack.pop()
                for a,b in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                    if 0<=a<m and 0<=b<n and grid[a][b]=='1' and (a,b) not in seen:
                        seen.add((a,b)); stack.append((a,b))
    return result

def p994(self, grid):
    m,n=len(grid),len(grid[0]); fresh=0; q=deque()
    for i in range(m):
        for j in range(n):
            if grid[i][j]==2: q.append((i,j,0))
            if grid[i][j]==1: fresh+=1
    minutes=0
    while q:
        x,y,t=q.popleft(); minutes=t
        for a,b in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0<=a<m and 0<=b<n and grid[a][b]==1:
                grid[a][b]=2; fresh-=1; q.append((a,b,t+1))
    return minutes if fresh==0 else -1

def p207(self, numCourses, prerequisites):
    graph=[[] for _ in range(numCourses)]; indegree=[0]*numCourses
    for a,b in prerequisites: graph[b].append(a); indegree[a]+=1
    q=deque(i for i,d in enumerate(indegree) if d==0); count=0
    while q:
        node=q.popleft(); count+=1
        for child in graph[node]:
            indegree[child]-=1
            if indegree[child]==0: q.append(child)
    return count==numCourses

class Trie:
    def __init__(self): self.root={}
    def insert(self,word):
        node=self.root
        for ch in word: node=node.setdefault(ch,{})
        node['#']=True
    def search(self,word):
        node=self.root
        for ch in word:
            if ch not in node: return False
            node=node[ch]
        return '#' in node
    def startsWith(self,prefix):
        node=self.root
        for ch in prefix:
            if ch not in node: return False
            node=node[ch]
        return True

def p46(self, nums):
    return [list(p) for p in itertools.permutations(nums)]

def p78(self, nums):
    result=[[]]
    for x in nums: result += [row+[x] for row in result]
    return result

def p17(self, digits):
    if not digits: return []
    letters={'2':'abc','3':'def','4':'ghi','5':'jkl','6':'mno','7':'pqrs','8':'tuv','9':'wxyz'}
    result=['']
    for digit in digits: result=[prefix+ch for prefix in result for ch in letters[digit]]
    return result

def p39(self, candidates, target):
    candidates=sorted(candidates); result=[]
    def visit(start,left,path):
        if left==0: result.append(path[:]); return
        for i in range(start,len(candidates)):
            if candidates[i]>left: break
            path.append(candidates[i]); visit(i,left-candidates[i],path); path.pop()
    visit(0,target,[]); return result

def p22(self, n):
    result=[]
    def visit(prefix,opened,closed):
        if len(prefix)==2*n: result.append(prefix); return
        if opened<n: visit(prefix+'(',opened+1,closed)
        if closed<opened: visit(prefix+')',opened,closed+1)
    visit('',0,0); return result

def p79(self, board, word):
    m,n=len(board),len(board[0]); seen=set()
    def visit(x,y,k):
        if not 0<=x<m or not 0<=y<n or (x,y) in seen or board[x][y]!=word[k]: return False
        if k==len(word)-1: return True
        seen.add((x,y))
        answer=any(visit(a,b,k+1) for a,b in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)))
        seen.remove((x,y)); return answer
    return any(visit(i,j,0) for i in range(m) for j in range(n))

def p131(self, s):
    result=[]
    def visit(start,path):
        if start==len(s): result.append(path[:]); return
        for end in range(start+1,len(s)+1):
            segment=s[start:end]
            if segment==segment[::-1]:
                path.append(segment); visit(end,path); path.pop()
    visit(0,[]); return result

def p51(self, n):
    result=[]; cols=set(); rising=set(); falling=set()
    def visit(row,board):
        if row==n: result.append(board[:]); return
        for col in range(n):
            if col in cols or row+col in rising or row-col in falling: continue
            cols.add(col); rising.add(row+col); falling.add(row-col)
            board.append('.'*col+'Q'+'.'*(n-col-1)); visit(row+1,board); board.pop()
            cols.remove(col); rising.remove(row+col); falling.remove(row-col)
    visit(0,[]); return result

def p35(self, nums, target):
    return bisect_left(nums,target)

def p74(self, matrix, target):
    m,n=len(matrix),len(matrix[0]); left,right=0,m*n
    while left<right:
        mid=(left+right)//2
        if matrix[mid//n][mid%n]<target: left=mid+1
        else: right=mid
    return left<m*n and matrix[left//n][left%n]==target

def p34(self, nums, target):
    left=bisect_left(nums,target); right=bisect_right(nums,target)-1
    return [left,right] if left<=right else [-1,-1]

def p33(self, nums, target):
    left,right=0,len(nums)-1
    while left<=right:
        mid=(left+right)//2
        if nums[mid]==target: return mid
        if nums[left]<=nums[mid]:
            if nums[left]<=target<nums[mid]: right=mid-1
            else: left=mid+1
        else:
            if nums[mid]<target<=nums[right]: left=mid+1
            else: right=mid-1
    return -1

def p153(self, nums):
    left,right=0,len(nums)-1
    while left<right:
        mid=(left+right)//2
        if nums[mid]>nums[right]: left=mid+1
        else: right=mid
    return nums[left]

def p4(self, nums1, nums2):
    a,b=nums1,nums2
    if len(a)>len(b): a,b=b,a
    m,n=len(a),len(b); left,right=0,m; half=(m+n+1)//2
    while left<=right:
        i=(left+right)//2; j=half-i
        al=a[i-1] if i else float('-inf'); ar=a[i] if i<m else float('inf')
        bl=b[j-1] if j else float('-inf'); br=b[j] if j<n else float('inf')
        if al<=br and bl<=ar:
            return max(al,bl) if (m+n)%2 else (max(al,bl)+min(ar,br))/2
        if al>br: right=i-1
        else: left=i+1

def p20(self, s):
    stack=[]; pairs={')':'(',']':'[','}':'{'}
    for ch in s:
        if ch in pairs:
            if not stack or stack.pop()!=pairs[ch]: return False
        else: stack.append(ch)
    return not stack

class MinStack:
    def __init__(self): self.items=[]
    def push(self,val): self.items.append((val,min(val,self.items[-1][1]) if self.items else val))
    def pop(self): self.items.pop()
    def top(self): return self.items[-1][0]
    def getMin(self): return self.items[-1][1]

def p394(self, s):
    stack=[]; count=0; current=''
    for ch in s:
        if ch.isdigit(): count=count*10+int(ch)
        elif ch=='[': stack.append((current,count)); current=''; count=0
        elif ch==']': prefix,repeats=stack.pop(); current=prefix+current*repeats
        else: current+=ch
    return current

def p739(self, temperatures):
    stack=[]; result=[0]*len(temperatures)
    for i,temp in enumerate(temperatures):
        while stack and temperatures[stack[-1]]<temp:
            j=stack.pop(); result[j]=i-j
        stack.append(i)
    return result

def p84(self, heights):
    stack=[]; best=0
    for i,height in enumerate(heights+[0]):
        start=i
        while stack and stack[-1][1]>height:
            start,h=stack.pop(); best=max(best,h*(i-start))
        stack.append((start,height))
    return best

def p215(self, nums, k):
    return heapq.nlargest(k,nums)[-1]

def p347(self, nums, k):
    return [value for value,count in Counter(nums).most_common(k)]

class MedianFinder:
    def __init__(self): self.low=[]; self.high=[]
    def addNum(self,num):
        heappush(self.low,-num); heappush(self.high,-heappop(self.low))
        if len(self.high)>len(self.low): heappush(self.low,-heappop(self.high))
    def findMedian(self):
        return -self.low[0] if len(self.low)>len(self.high) else (-self.low[0]+self.high[0])/2

def p121(self, prices):
    low=float('inf'); best=0
    for price in prices: low=min(low,price); best=max(best,price-low)
    return best

def p55(self, nums):
    farthest=0
    for i,value in enumerate(nums):
        if i>farthest: return False
        farthest=max(farthest,i+value)
    return True

def p45(self, nums):
    end=farthest=steps=0
    for i in range(len(nums)-1):
        farthest=max(farthest,i+nums[i])
        if i==end: steps+=1; end=farthest
    return steps

def p763(self, s):
    last={ch:i for i,ch in enumerate(s)}; result=[]; start=end=0
    for i,ch in enumerate(s):
        end=max(end,last[ch])
        if i==end: result.append(end-start+1); start=i+1
    return result

def p70(self, n):
    a,b=1,1
    for _ in range(n): a,b=b,a+b
    return a

def p118(self, numRows):
    result=[]; row=[]
    for _ in range(numRows):
        row=[a+b for a,b in zip([0]+row,row+[0])] if row else [1]
        result.append(row)
    return result

def p198(self, nums):
    previous=current=0
    for value in nums: previous,current=current,max(current,previous+value)
    return current

def p279(self, n):
    squares=[i*i for i in range(1,isqrt(n)+1)]; dp=[0]+[n+1]*n
    for value in range(1,n+1): dp[value]=1+min(dp[value-square] for square in squares if square<=value)
    return dp[n]

def p322(self, coins, amount):
    dp=[0]+[amount+1]*amount
    for value in range(1,amount+1):
        for coin in coins:
            if coin<=value: dp[value]=min(dp[value],dp[value-coin]+1)
    return dp[amount] if dp[amount]<=amount else -1

def p139(self, s, wordDict):
    words=set(wordDict); dp=[True]+[False]*len(s)
    for end in range(1,len(s)+1): dp[end]=any(dp[start] and s[start:end] in words for start in range(end))
    return dp[-1]

def p300(self, nums):
    tails=[]
    for value in nums:
        index=bisect_left(tails,value)
        if index==len(tails): tails.append(value)
        else: tails[index]=value
    return len(tails)

def p152(self, nums):
    low=high=best=nums[0]
    for value in nums[1:]:
        low,high=min(value,value*low,value*high),max(value,value*low,value*high)
        best=max(best,high)
    return best

def p416(self, nums):
    total=sum(nums)
    if total%2: return False
    reachable=1
    for value in nums: reachable |= reachable<<value
    return bool(reachable & (1<<(total//2)))

def p32(self, s):
    stack=[-1]; best=0
    for i,ch in enumerate(s):
        if ch=='(': stack.append(i)
        else:
            stack.pop()
            if not stack: stack.append(i)
            else: best=max(best,i-stack[-1])
    return best

def p62(self, m, n):
    return comb(m+n-2,m-1)

def p64(self, grid):
    dp=[float('inf')]*len(grid[0]); dp[0]=0
    for row in grid:
        for j,value in enumerate(row): dp[j]=min(dp[j],dp[j-1] if j else float('inf'))+value
    return dp[-1]

def p5(self, s):
    best=''
    for center in range(len(s)):
        for left,right in ((center,center),(center,center+1)):
            while left>=0 and right<len(s) and s[left]==s[right]:
                if right-left+1>len(best): best=s[left:right+1]
                left-=1; right+=1
    return best

def p1143(self, text1, text2):
    previous=[0]*(len(text2)+1)
    for a in text1:
        current=[0]
        for j,b in enumerate(text2): current.append(previous[j]+1 if a==b else max(previous[j+1],current[-1]))
        previous=current
    return previous[-1]

def p72(self, word1, word2):
    previous=list(range(len(word2)+1))
    for i,a in enumerate(word1,1):
        current=[i]
        for j,b in enumerate(word2,1): current.append(previous[j-1] if a==b else min(previous[j],previous[j-1],current[-1])+1)
        previous=current
    return previous[-1]

def p136(self, nums):
    result=0
    for value in nums: result ^= value
    return result

def p169(self, nums):
    candidate=None; votes=0
    for value in nums:
        if not votes: candidate=value
        votes += 1 if value==candidate else -1
    return candidate

def p75(self, nums):
    left=current=0; right=len(nums)-1
    while current<=right:
        if nums[current]==0:
            nums[left],nums[current]=nums[current],nums[left]; left+=1; current+=1
        elif nums[current]==2:
            nums[current],nums[right]=nums[right],nums[current]; right-=1
        else: current+=1

def p31(self, nums):
    i=len(nums)-2
    while i>=0 and nums[i]>=nums[i+1]: i-=1
    if i>=0:
        j=len(nums)-1
        while nums[j]<=nums[i]: j-=1
        nums[i],nums[j]=nums[j],nums[i]
    nums[i+1:]=reversed(nums[i+1:])

def p287(self, nums):
    slow=fast=nums[0]
    while True:
        slow=nums[slow]; fast=nums[nums[fast]]
        if slow==fast: break
    slow=nums[0]
    while slow!=fast: slow=nums[slow]; fast=nums[fast]
    return slow

def export_sources():
    root=Path(__file__).resolve().parents[1]
    problems=json.loads((root/'data'/'problems.json').read_text(encoding='utf-8'))
    text=Path(__file__).read_text(encoding='utf-8'); module=ast.parse(text)
    functions={node.name:node for node in module.body if isinstance(node,(ast.FunctionDef,ast.ClassDef))}
    sources={}
    for problem in problems:
        meta=problem['meta']; pid=problem['id']
        if meta.get('systemdesign'):
            source=ast.get_source_segment(text,functions[meta['classname']])
        else:
            node=functions['p'+pid]
            source=ast.get_source_segment(text,node)
            source=source.replace('def p'+pid+'(', 'def '+meta['name']+'(',1)
            source='class Solution:\n'+'\n'.join('    '+line for line in source.splitlines())
        sources[pid]=source+'\n'
        compile(source,problem['slug'],'exec')
    dest=root/'docs'/'catalog-reference-sources.json'; dest.parent.mkdir(exist_ok=True)
    dest.write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Exported {len(sources)} locally authored reference implementations to {dest}')

if __name__=='__main__': export_sources()
