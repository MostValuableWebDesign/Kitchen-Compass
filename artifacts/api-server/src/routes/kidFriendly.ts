// A familiar-format heuristic for published recipes. It describes the meal,
// not an individual child's preferences or age-specific food safety.
const familiarFormats = [
  /\b(mac(?:aroni)? (?:and |&) cheese|cheesy pasta|pasta|spaghetti|noodles?)\b/i,
  /\b(pizza|quesadilla|grilled cheese|sandwich|wrap|burrito)\b/i,
  /\b(pancakes?|waffles?|french toast|oatmeal|scrambled eggs?)\b/i,
  /\b(chicken (?:bites|tenders|strips|nuggets)|meatballs?|rice bowls?)\b/i,
];
const strongFlavors = /\b(spicy|hot sauce|chili|chilli|cayenne|jalape[nñ]o|habanero)\b/i;

export function kidFriendlyScore(title: string, ingredients: string[]) {
  if (strongFlavors.test(title) || ingredients.some((item) => strongFlavors.test(item))) return 0;
  return familiarFormats.some((pattern) => pattern.test(title)) ? 1 : 0;
}
