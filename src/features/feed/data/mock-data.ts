import { FeedPost } from "../types/feed.types";

const feedData: FeedPost[] = [
  {
    postId: "1",
    userId: "user1",
    content: [
      {
        type: "image",
        uri: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQNO_DUpnw-gGYi_hGzo66LqH_Uyxcs9dI6eA&s",
      },
    ],
    album: {
      albumId: "album1",
      title: "Thailand 2026",
      description: "Summer vacation photos",
      ownerId: "user1",
      createdAt: new Date(),
      members: [
        {
          userId: "user1",
          name: "Alice",
          avatarUrl:
            "https://scontent-arn2-1.cdninstagram.com/v/t51.2885-19/613540473_17847216552665438_84554593792970416_n.jpg?efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-arn2-1.cdninstagram.com&_nc_cat=102&_nc_oc=Q6cZ2QE4JT0bDLit7GE711zg6QDrqliQCwyDJmWTRTFIL0iaoPENIXocU23ORGsptlt_FUo&_nc_ohc=C2EzhUCDq4EQ7kNvwFHWAkg&_nc_gid=sMDZXRecUpRsl6bb_Tu7lg&edm=ALGbJPMBAAAA&ccb=7-5&oh=00_AfraNLxQY6rewmqwgwkOLRjJjElgush9qwEaKh3nanT3sw&oe=6980DC5A&_nc_sid=7d3ac5",
          role: "owner",
        },
        {
          userId: "user2",
          name: "Bob",
          avatarUrl:
            "https://marszalstudio.pl/wp-content/uploads/2024/01/fajne-zdjecia-profilowe-19.webp",
          role: "contributor",
        },
      ],
    },
  },
];

export default feedData;
