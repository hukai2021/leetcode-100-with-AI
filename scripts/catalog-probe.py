import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')
query = '''query studyPlanV2Detail($planSlug: String!) {
  studyPlanV2Detail(planSlug: $planSlug) {
    name slug
    planSubGroups {
      name slug
      questions {
        titleSlug title translatedTitle questionFrontendId difficulty
      }
    }
  }
}'''
payload = {'query': query, 'variables': {'planSlug': 'top-100-liked'}}
request = urllib.request.Request(sys.argv[1] if len(sys.argv) > 1 else 'https://leetcode.cn/graphql/', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://leetcode.cn/studyplan/top-100-liked/'})
try:
    print(urllib.request.urlopen(request, timeout=30).read().decode())
except urllib.error.HTTPError as error:
    print(error.code, error.read().decode()[:3000])
