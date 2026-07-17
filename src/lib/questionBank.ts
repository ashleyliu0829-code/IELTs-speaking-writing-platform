export type P1QuestionSet = {
  id: string;
  topic: string;
  questions: string[];
};

export type P2P3QuestionSet = {
  id: string;
  topic: string;
  p2Prompt: string;
  p3Questions: string[];
};

function cueCard(title: string, bullets: string[]) {
  return `${title}.\n\nYou should say:\n${bullets.map((bullet) => `- ${cleanCueBullet(bullet)}`).join("\n")}`;
}

function cleanCueBullet(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/What/g, "What ")
    .replace(/When/g, "When ")
    .replace(/Where/g, "Where ")
    .replace(/Who/g, "Who ")
    .replace(/Why/g, "Why ")
    .replace(/How/g, "How ")
    .replace(/And/g, "And ")
    .replace(/you/g, " you")
    .replace(/your/g, " your")
    .replace(/he\/she/g, " he/she")
    .replace(/him\/her/g, " him/her")
    .replace(/it/g, " it")
    .replace(/the/g, " the")
    .replace(/was/g, " was")
    .replace(/is/g, " is")
    .replace(/are/g, " are")
    .replace(/about/g, " about")
    .replace(/with/g, " with")
    .replace(/felt/g, " felt")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

export const p1QuestionBank: P1QuestionSet[] = [
  {
    id: "headphones",
    topic: "Headphones",
    questions: [
      "Do you use headphones?",
      "What type of headphones do you use?",
      "When would you use headphones?",
      "In what conditions would you not use headphones?",
      "Is wearing headphones comfortable?"
    ]
  },
  {
    id: "jokes-comedies",
    topic: "Jokes & comedies",
    questions: [
      "Are you good at telling jokes?",
      "Do your friends like to tell jokes?",
      "Do you like to watch comedies?",
      "Have you ever watched a live show?",
      "Are comedy shows popular in your country?"
    ]
  },
  {
    id: "clothing",
    topic: "Clothing",
    questions: [
      "What kind of clothes do you like to wear?",
      "Do you prefer casual clothes or smart clothes?",
      "Do you like wearing T-shirts?",
      "Do you spend a lot of time choosing clothes?",
      "What colour clothes do you like?"
    ]
  },
  {
    id: "singing",
    topic: "Singing",
    questions: [
      "Do you like singing? Why?",
      "Have you ever learnt how to sing?",
      "Who do you want to sing for?",
      "Do you think singing can bring happiness to people?",
      "Do you like listening to others singing?",
      "Have you ever taken a singing class?"
    ]
  },
  {
    id: "outer-space-stars",
    topic: "Outer space and stars",
    questions: [
      "Have you ever learnt about outer space and stars?",
      "Do you like science fiction movies? Why?",
      "Do you want to know more about outer space?",
      "Do you want to go into outer space in the future?"
    ]
  },
  {
    id: "science",
    topic: "Science",
    questions: [
      "Do you like science?",
      "When did you start to learn about science?",
      "Which science subject is interesting to you?",
      "Do you like watching science TV programs?",
      "Do Chinese people often visit science museums?"
    ]
  },
  {
    id: "public-gardens-parks",
    topic: "Public gardens and parks",
    questions: [
      "Did you like going to parks as a child?",
      "Do you still like going to parks now?",
      "Would you like to see more parks in your city?",
      "Are there any parks you want to go to in the future?",
      "Would you like to play in a public garden or park?",
      "What do you like to do when visiting a park?"
    ]
  },
  {
    id: "cars",
    topic: "Cars",
    questions: [
      "Did you enjoy traveling by car when you were a kid?",
      "What types of cars do you like?",
      "Do you prefer to be a driver or a passenger?",
      "What do you usually do when there is a traffic jam?",
      "Do you think car colours are important?",
      "Will you buy an expensive car in the future?"
    ]
  },
  {
    id: "shopping",
    topic: "Shopping",
    questions: [
      "Do you like shopping?",
      "How often do you go shopping?",
      "Do you prefer online shopping or in-store shopping?",
      "Have you ever returned anything you bought online?"
    ]
  },
  {
    id: "watch",
    topic: "Watch",
    questions: [
      "Do you wear a watch?",
      "Have you ever got a watch as a gift?",
      "Why do some people wear expensive watches?",
      "Do you think it is important to wear a watch? Why?"
    ]
  },
  {
    id: "websites",
    topic: "Websites",
    questions: [
      "What kinds of websites do you often visit?",
      "What is your favourite website?",
      "Are there any changes to the websites you often visit?",
      "What kinds of websites are popular in your country?",
      "Would you like to have your own website?",
      "How can websites help your life or studies?"
    ]
  },
  {
    id: "tidiness",
    topic: "Tidiness",
    questions: [
      "Do you like to keep things tidy?",
      "Did you use to keep your room tidy as a child?",
      "How do you keep your work or study space tidy?",
      "Do you think that it is necessary to be tidy?"
    ]
  },
  {
    id: "mirrors",
    topic: "Mirrors",
    questions: [
      "Do you like looking at yourself in the mirror?",
      "Have you ever bought mirrors?",
      "Do you usually take a mirror with you?",
      "Would you use mirrors to decorate your room?"
    ]
  },
  {
    id: "music",
    topic: "Music",
    questions: [
      "Do you prefer sad or happy music?",
      "Does happy music make you feel more excited?",
      "Have you taken any music classes?",
      "Do you listen to music while doing other things?"
    ]
  },
  {
    id: "teachers",
    topic: "Teachers",
    questions: [
      "Do you have a favorite teacher?",
      "Do you want to be a teacher in the future?",
      "What kind of teacher do you remember best?",
      "In what way has your favourite teacher helped you?",
      "Do you still keep in touch with your high school teachers?"
    ]
  },
  {
    id: "social-media",
    topic: "Social media",
    questions: [
      "Have you ever posted anything on social media?",
      "When did you start using social media?",
      "Do you think you spend too much time on social media?",
      "Do your friends use social media?",
      "What do people often do on social media?"
    ]
  },
  {
    id: "art",
    topic: "Art",
    questions: [
      "Do you like art?",
      "Do you like visiting art galleries?",
      "Do you want to be an artist?",
      "Do you like modern art or traditional art?"
    ]
  },
  {
    id: "sports-programs",
    topic: "Sports programs",
    questions: [
      "Do you like watching sports programs on TV?",
      "Do you like to watch live sports games?",
      "Who do you like to watch sports games with?",
      "Do you prefer watching sports games alone or with friends?",
      "Have you ever watched a sports game in a stadium?"
    ]
  },
  {
    id: "morning-routines",
    topic: "Morning routines",
    questions: [
      "What do you do right after getting up in the morning?",
      "Is breakfast important?",
      "What is your morning routine?",
      "Do you like to get up early in the morning?"
    ]
  },
  {
    id: "evening-time",
    topic: "Evening time",
    questions: [
      "Do you like the morning or evening?",
      "What do you usually do in the evening?",
      "What did you do in the evening when you were little?",
      "Do you do the same things in the evening on weekends and weekdays? Why?",
      "What do you hate doing in the evening?"
    ]
  },
  {
    id: "old-buildings",
    topic: "Old buildings",
    questions: [
      "Have you ever seen old buildings in the city?",
      "Do you think we should preserve old buildings in cities?"
    ]
  },
  {
    id: "films-cinemas",
    topic: "Films / cinemas",
    questions: [
      "What films do you like?",
      "Did you often watch films when you were a child?",
      "Did you ever go to the cinema alone as a child?",
      "Do you often go to the cinema with your friends?",
      "How often do you watch films?",
      "Do you prefer to watch films at home or in the cinema?"
    ]
  },
  {
    id: "history",
    topic: "History",
    questions: [
      "Have you ever been to historical museums?",
      "Do you like history?",
      "When was the last time you read about history?",
      "Did you like history when you were young?"
    ]
  },
  {
    id: "dream-ambition",
    topic: "Dream and ambition",
    questions: [
      "What was your childhood dream?",
      "Are you the kind of person who sticks to dreams?",
      "What is your dream job?",
      "Do you think you are an ambitious person?"
    ]
  }
];

export const p2P3QuestionBank: P2P3QuestionSet[] = [
  {
    id: "languages-person",
    topic: "A person good at learning languages",
    p2Prompt: cueCard("Describe a person who is good at learning and speaking new languages", [
      "Howyougottoknowhim/her",
      "Howhe/shelearnsanewlanguage",
      "Whatlanguageshe/shecanspeak",
      "Andexplainhowyoufeelabouthim/her"
    ]),
    p3Questions: [
      "Does speaking other languages help at work?",
      "Do people learn any languages other than English?",
      "How do people learn new things?"
    ]
  },
  {
    id: "technological-problem",
    topic: "A challenging technological problem",
    p2Prompt: cueCard("Describe a challenging technological problem you faced", [
      "Whattheproblemwas",
      "Whenandwhereyoufacedit",
      "Howchallengingitwas",
      "Andexplainhowyousolvedit"
    ]),
    p3Questions: [
      "What are the advantages and disadvantages of AI?",
      "Should children learn to use AI?",
      "How can AI help in our lives?",
      "Do you think students are overly reliant on AI?"
    ]
  },
  {
    id: "interesting-video",
    topic: "An interesting video",
    p2Prompt: cueCard("Describe an interesting video", [
      "Whenandwhereyouwatchedit",
      "Whatitisabout",
      "Whyyouwatchedit",
      "Andexplainhowyoufeelaboutit"
    ]),
    p3Questions: [
      "What skills can people learn from watching videos?",
      "What makes a video go viral online?"
    ]
  },
  {
    id: "recent-change",
    topic: "A change you made recently",
    p2Prompt: cueCard("Describe a change that you made recently", [
      "Whatthechangewas",
      "Whatcausedthechange",
      "Whatyoudidforthechange",
      "Andexplainhowyoufeelaboutthechange"
    ]),
    p3Questions: [
      "Do you think it is good to change one's daily routine?",
      "Do you think it is good to change jobs?",
      "Is it good for people to get a job promotion?"
    ]
  },
  {
    id: "worked-in-group",
    topic: "Working in a group",
    p2Prompt: cueCard("Describe a time when you worked in a group", [
      "Whatyoudid",
      "Whoyouworkedwith",
      "Whatproblemsyoufaced",
      "Andexplainwhyyouworkedinthegroup"
    ]),
    p3Questions: [
      "Why do some people prefer to work by themselves?",
      "Should students learn to do group work?",
      "What group tasks are there in schools?",
      "How can you tell if a person is a good leader?"
    ]
  },
  {
    id: "tall-building",
    topic: "A tall building",
    p2Prompt: cueCard("Describe a tall building you like or dislike", [
      "Whatitisusedfor",
      "Whereitis",
      "Whatitlookslike",
      "Andexplainwhyyoulike/dislikeit"
    ]),
    p3Questions: [
      "Are there many tall buildings in your country?",
      "What are the advantages of living in tall buildings?",
      "What kind of interior design style do most people like?"
    ]
  },
  {
    id: "boring-place",
    topic: "A boring place",
    p2Prompt: cueCard("Describe a boring place", [
      "Whereitis",
      "Whoyouwenttherewith",
      "Whatyoudidthere",
      "Andexplainwhyyouthinkitisaboringplace"
    ]),
    p3Questions: [
      "Do most people think news about celebrities is boring?",
      "Why do most children think education is boring?",
      "What can people do when they feel bored?",
      "Why are some teachers' classes boring?"
    ]
  },
  {
    id: "got-up-early",
    topic: "Getting up early",
    p2Prompt: cueCard("Describe a time when you got up early", [
      "Whenitwas",
      "Whatyoudid",
      "Whyyougotupearly",
      "Andhowyoufeltaboutit"
    ]),
    p3Questions: [
      "Do you know anyone who likes to get up early?",
      "Why do people get up early?",
      "What kinds of occasions need people to arrive early?",
      "Why do some people like to stay up late?",
      "Is it good to arrive early in any situation?",
      "What kind of people like getting up early?"
    ]
  },
  {
    id: "changed-plan",
    topic: "A plan you changed recently",
    p2Prompt: cueCard("Describe a plan that you had to change recently", [
      "Whenthishappened",
      "Whatmadeyouchangetheplan",
      "Whatthenewplanwas",
      "Andhowyoufeltaboutthechange"
    ]),
    p3Questions: [
      "Do people often change their plans?",
      "Would you tell others if you change your plan?",
      "How does technology help people make plans?",
      "What kind of plans do people often make?"
    ]
  },
  {
    id: "recommended-place",
    topic: "A place you recommend for travel",
    p2Prompt: cueCard("Describe a place you have travelled to that you would like to recommend to others", [
      "Whatitis",
      "Whereitis",
      "Whatyousawanddidthere",
      "Andexplainwhyyouwouldliketorecommendittoothers"
    ]),
    p3Questions: [
      "Where do people in your country often go for holidays?",
      "What is the ideal length for a holiday?",
      "How do people usually plan holidays?",
      "Is it important to plan a holiday ahead?",
      "Why do many countries try to attract people to visit?",
      "How do people decide when to travel?"
    ]
  },
  {
    id: "animals-story-book",
    topic: "A story or book with animals",
    p2Prompt: cueCard("Describe a story/book with animals in it", [
      "Whatanimalsareinit",
      "Whenthestoryhappened",
      "Whatthestoryisabout",
      "Andexplainhowyoufeelaboutit"
    ]),
    p3Questions: [
      "Should schools teach children about animals?",
      "What do you think about keeping animals as pets?",
      "Do many people keep pets in your country?",
      "What are the advantages of keeping a pet?"
    ]
  },
  {
    id: "environmental-law",
    topic: "An environmental protection law",
    p2Prompt: cueCard("Describe a law on environmental protection", [
      "Whatitis",
      "Howyoufirstlearnedaboutit",
      "Whobenefitsfromit",
      "Andexplainhowyoufeelaboutthislaw"
    ]),
    p3Questions: [
      "What kinds of rules do schools in China have?",
      "Do you think school rules are important?",
      "Are children unhappy with school rules?",
      "What are the rules people should obey at work?",
      "What is the purpose of punishment?"
    ]
  },
  {
    id: "home-to-visit",
    topic: "A home you like to visit",
    p2Prompt: cueCard("Describe a home that you like to visit but do not want to live in", [
      "Whereitis",
      "Whatitislike",
      "Whyyouliketovisitit",
      "Andexplainwhyyouwouldnotliketolivethere"
    ]),
    p3Questions: [
      "Do Chinese people like to visit others' homes?",
      "What do Chinese people do when they visit others?",
      "How often do you visit your relatives or friends?"
    ]
  },
  {
    id: "new-law",
    topic: "A new law",
    p2Prompt: cueCard("Describe a new law you would like to introduce in your country", [
      "Whatlawitis",
      "Whatchangesthislawbrings",
      "Whetherthisnewlawwillbepopular",
      "Howyoucameupwiththenewlaw",
      "Andexplainhowyoufeelaboutthisnewlaw"
    ]),
    p3Questions: [
      "What rules should students follow at school?",
      "Do people in your country usually obey the law?",
      "What kinds of behavior are considered good behavior?",
      "What are the benefits for people to obey rules?",
      "How can parents teach children to obey rules?"
    ]
  },
  {
    id: "local-news",
    topic: "A piece of local news",
    p2Prompt: cueCard("Describe a piece of local news that people are interested in", [
      "Whatitwasabout",
      "Whereyousaw/heardit",
      "Whowasinvolved",
      "Andexplainwhypeoplewereinterestedinit"
    ]),
    p3Questions: [
      "Do people read the newspaper where you live?",
      "Do people prefer local or international news?",
      "Do you think it's important to have a national identity?",
      "How can people develop their national identity?"
    ]
  },
  {
    id: "successful-business-person",
    topic: "A person with a successful business",
    p2Prompt: cueCard("Describe a person you know who has a successful business", [
      "Whothispersonis",
      "Howyougottoknowhim/her",
      "Whyandhowhe/shestartedthebusiness",
      "Whatbusinesshe/shedoes",
      "Andexplainwhyyouthinkthebusinessissuccessful"
    ]),
    p3Questions: [
      "Why do some people start their own business?",
      "What makes a business successful?",
      "What makes a business fail?",
      "Is it easy to set up a new business in your country?"
    ]
  },
  {
    id: "plant-lover",
    topic: "A person who loves growing plants",
    p2Prompt: cueCard("Describe a person who loves to grow plants at home or in the garden", [
      "Whothispersonis",
      "Whatplantshe/shegrows",
      "Howhe/shegrowstheplants",
      "Andexplainwhyhe/shelovesgrowingplants"
    ]),
    p3Questions: [
      "Is it easy to grow plants at home?",
      "Why do people like to grow plants?",
      "Do you think students should learn to grow plants?"
    ]
  },
  {
    id: "childhood-friend",
    topic: "A childhood friend",
    p2Prompt: cueCard("Describe a friend from your childhood", [
      "Whohe/sheis",
      "Whereandhowyoumeteachother",
      "Whatyouoftendidtogether",
      "Andexplainhowyoufeelabouthim/her"
    ]),
    p3Questions: [
      "How important is childhood friendship to children?",
      "What do you think of communicating via social media?",
      "Has technology changed people's friendships? How?"
    ]
  },
  {
    id: "live-sports-event",
    topic: "A live sports event",
    p2Prompt: cueCard("Describe a live sports event you watched and liked", [
      "Whatitwas",
      "Whenandwhereyouwatchedit",
      "Whoyouwatcheditwith",
      "Andexplainwhyyoulikedit"
    ]),
    p3Questions: [
      "Why do some people like to watch sports events?",
      "Where do people normally watch sports events?",
      "What sports games are popular in your country?"
    ]
  },
  {
    id: "important-decision",
    topic: "An important decision",
    p2Prompt: cueCard("Describe an important decision that you made", [
      "Whatthedecisionwas",
      "Howyoumadeyourdecision",
      "Whattheresultsofthedecisionwere",
      "Andexplainwhyitwasimportant"
    ]),
    p3Questions: [
      "How do people usually make important decisions?",
      "Do you think the influence of advertising is good?"
    ]
  },
  {
    id: "celebrity-advertisement",
    topic: "An advertisement with a famous person",
    p2Prompt: cueCard("Describe an advertisement with a famous person in it", [
      "Whothepersonis",
      "Whereyoucanseeit",
      "Whattheadvertisementisabout",
      "Andexplainhowyoufeelabouttheadvertisement"
    ]),
    p3Questions: [
      "Why are many advertisements endorsed by celebrities?",
      "How useful are they?",
      "What is the most important factor in an advertisement?",
      "Why are some advertisements boring?",
      "Is advertising important for a company? Why?"
    ]
  },
  {
    id: "long-term-goal",
    topic: "A long-term goal or ambition",
    p2Prompt: cueCard("Describe a long-term goal/ambition you would like to achieve", [
      "Howlongyouhavehadthisgoal/ambition",
      "Whatitis",
      "Howyouwillachieveit",
      "Andexplainwhyyousetit"
    ]),
    p3Questions: [
      "Why should children have ambitions?",
      "What do you think of people going after high positions?",
      "Is it good for a person to be ambitious?"
    ]
  },
  {
    id: "language-learning-activity",
    topic: "Something you did to learn another language",
    p2Prompt: cueCard("Describe a thing you did to learn another language", [
      "Whatlanguageyoulearned",
      "Whatyoudid",
      "Howithelpedyoulearnthelanguage",
      "Andhowyoufeltaboutit"
    ]),
    p3Questions: [
      "Do you think language learning is important? Why?",
      "Is it better to learn a language alone or in a group? Why?",
      "Some people think it is unnecessary to learn languages. What do you think?"
    ]
  },
  {
    id: "organized-happy-event",
    topic: "Organizing a happy event",
    p2Prompt: cueCard("Describe a time when you organized a happy event successfully", [
      "Whattheeventwas",
      "Howyoupreparedforit",
      "Whohelpedyoutoorganizeit",
      "Andexplainwhyyouthinkitwasasuccessfulevent"
    ]),
    p3Questions: [
      "How can parents help children to be organized?",
      "Does everything need to be well prepared?",
      "Do people need others' help when organizing things?"
    ]
  },
  {
    id: "important-river-lake",
    topic: "An important river or lake",
    p2Prompt: cueCard("Describe an important river/lake in your country", [
      "Whereitislocated",
      "Howbig/longitis",
      "Whatitlookslike",
      "Andexplainwhyitisimportant"
    ]),
    p3Questions: [
      "Are rivers and lakes important to a country?",
      "What are the popular water sports in your country?",
      "Are rivers and lakes good for transport? Why?",
      "How do rivers and lakes affect local tourism?",
      "Do you think rivers and lakes attract tourists?",
      "How can rivers and lakes benefit local people?"
    ]
  },
  {
    id: "traffic-jam",
    topic: "A long traffic jam",
    p2Prompt: cueCard("Describe a time when you were stuck in a traffic jam for a very long time", [
      "Whenithappened",
      "Whereyouwerestuck",
      "Whatyoudidwhilewaiting",
      "Andexplainhowyoufeltinthetrafficjam"
    ]),
    p3Questions: [
      "How can we solve the traffic jam problem?",
      "Do you think highways will help reduce traffic jams?",
      "What are good ways to manage traffic?",
      "Do you like to use public transport?",
      "Would you rather be in a car or a bus in a traffic jam?"
    ]
  },
  {
    id: "cheap-day-out",
    topic: "A special day out that cost little money",
    p2Prompt: cueCard("Describe a special day out that cost you little money or did not cost you much", [
      "Whenthedaywas",
      "Whereyouwent",
      "Howmuchyouspent",
      "Andexplainhowyoufeelabouttheday"
    ]),
    p3Questions: [
      "How do people spend their leisure time in your country?",
      "Why do people like to have days off?",
      "Do you think only old people have time for leisure?"
    ]
  }
];
