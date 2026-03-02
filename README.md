<img src="https://wyntr.netlify.app/image/w.png" height="200"></img>

<h1>Wyntr</h1>

## netlify .env

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK
DISCORD_WEBHOOK_URL_1=https://discord.com/api/webhooks/YOUR_WEBHOOK
```

## firestore rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {  
    //ban list 
    match /banned/{userId} {
      allow read: if true;
      allow create, delete: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
      allow update: if false; 
    }
    
    match /invites/{inviteId} {
      allow read: if true;
      allow create, update: if request.auth != null;
      allow delete: if false;
    }
    
    //communities
    match /communities/{communityId} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.creatorId == request.auth.uid
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0

      allow update: if request.auth != null && (
        request.writeFields.hasOnly(["membersCount"]) ||
        request.writeFields.hasOnly(["posts"]) ||
        request.writeFields.hasOnly(["admin"]) ||
        request.writeFields.hasOnly(["pinned"]) ||
        request.writeFields.hasOnly(["name", "lowerCase", "description", "banner", "avatar", "acceptingApplications", "private", "tags", "requirements", "rules"])
      );

      allow delete: if request.auth != null && (
        resource.data.creatorId == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin"
      );
      
      match /members/{userId} {
        allow create, read, delete: if request.auth != null;
        allow update: if false;
      }
      
      match /bans/{userId} {
        allow create, read, delete: if request.auth != null;
        allow update: if false;
      }

      match /posts/{postId} {
        allow read: if true;

        allow create: if request.auth != null &&
          request.resource.data.uid == request.auth.uid &&
          request.resource.data.text is string &&
          request.resource.data.text.size() > 0;

        allow update: if request.auth != null && (
          (resource.data.uid == request.auth.uid &&
           request.writeFields.hasOnly(["text"])) ||
          request.writeFields.hasOnly(["likeCount"]) ||
          request.writeFields.hasOnly(["poll"]) ||
          request.writeFields.hasOnly(["commentCount"]) ||
          request.writeFields.hasOnly(["retweetCount"]) ||
          request.writeFields.hasOnly(["viewsCount"]) ||
          request.writeFields.hasOnly(["commentCount", "donations"]) ||
          request.writeFields.hasOnly(["text", "title", "edited", "language"]) ||
          request.writeFields.hasOnly(["connectedWynt"]) ||
          request.writeFields.hasOnly(["WS"]) 
        );

        allow delete: if request.auth != null && (
          resource.data.uid == request.auth.uid ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin"
        );

        match /likes/{userId} {
          allow read: if true;
          allow create: if request.auth != null && request.auth.uid == userId;
          allow delete: if request.auth != null && request.auth.uid == userId;
        }

        match /votes/{userId} {
          allow read: if true;
          allow create: if request.auth != null && request.auth.uid == userId;
          allow delete, update: if false;
        }

        match /views/{userId} {
          allow read: if true;
          allow create: if request.auth != null && request.auth.uid == userId;
        }

        match /comments/{commentId} {
          allow read: if true;

          allow create: if request.auth != null &&
            request.resource.data.uid == request.auth.uid;

          allow update: if request.auth != null && (
            (resource.data.uid == request.auth.uid &&
            request.writeFields.hasOnly(['text', 'edited', "language"])) ||
            request.writeFields.hasOnly(['replyCount', 'ownerReplied']) ||
            request.writeFields.hasOnly(['likeCount']) ||
            request.writeFields.hasOnly(['replyCount']) ||
            request.writeFields.hasOnly(['retweetCount']) ||
            request.writeFields.hasOnly(['isHidden']) ||
            request.writeFields.hasOnly(['ownerReplied']) ||
            request.writeFields.hasOnly(['ownerReplying']) ||
            request.writeFields.hasOnly(['pinned', 'hasBeenPinned']) ||
            get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin"
          );

          allow delete: if request.auth != null && (
            resource.data.uid == request.auth.uid ||
            get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin"
          );

          match /likes/{userId} {
            allow read: if true;
            allow create: if request.auth != null && request.auth.uid == userId;
            allow delete: if request.auth != null && request.auth.uid == userId;
          }
          
          match /votes/{userId} {
          	allow read: if true;
          	allow create: if request.auth != null && request.auth.uid == userId;
         	 	allow delete, update: if false;
        	}
        }
      }
    }
    
    //sus list
    match /susList/{userId} {
      allow create, read, update: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
      allow delete: if false; 
    }

    // Tags and their tweets
    match /tags/{tagId} {
      allow read: if true;
      allow create, update: if request.auth != null;

      match /tweets/{tweetId} {
        allow read: if true;
        allow create, update: if request.auth != null;
        allow delete: if request.auth != null;
      }
    }

    // Users and subcollections
    match /users/{userId} {
      allow read: if true;
        allow update: if request.auth != null && (
          (request.auth.uid == userId && request.writeFields.hasOnly(["posts"])) ||
          (request.writeFields.hasOnly(["balance"]) &&
          request.resource.data.balance is int &&
          request.resource.data.balance > resource.data.balance) ||
          (request.writeFields.hasOnly(["followers"])) ||
          (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin'] &&
          request.writeFields.hasOnly(["banReason"])) ||
          (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin'] &&
          request.writeFields.hasAll(["posts"])) ||
          !("role" in request.resource.data.diff(resource.data).affectedKeys()));
        allow write: if request.auth != null &&
         !("role" in request.resource.data.keys()) &&
         (request.auth.uid == userId ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin");
        allow delete: if false;
        
      // Mentions
      match /mentioned/{tweetId} {
        allow read: if true;
        allow create: if request.auth != null &&
          exists(/databases/$(database)/documents/tweets/$(tweetId)) &&
          userId in get(/databases/$(database)/documents/tweets/$(tweetId)).data.mentions;
        allow delete: if request.auth != null &&
          exists(/databases/$(database)/documents/tweets/$(tweetId)) &&
          (request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin");
      }
      
      // Posts
      match /posts/{postId} {
        allow read: if true;
        allow write: if request.auth != null && (
          request.auth.uid == userId ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin']);
      }
      
      //notification
      match /notifications/{notificationId} {
        allow create, read, delete, update: if true;
      }

      // Bookmarks
      match /bookmarks/{folderId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
        match /items/{tweetId} {
          allow read: if true;
          allow write: if request.auth != null && request.auth.uid == userId;
        }
      }
      
      //highlights
      match /highlights/{tweetId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
      }
      
      match /replies/{tweetId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
      }

      // Following
      match /following/{targetId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == userId;
      }

      // Followers
      match /followers/{followerId} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == followerId;
      }
    }

    // Tweets and subcollections
    match /tweets/{tweetId} {
      allow read: if true;
      allow create: if request.auth != null &&
        request.resource.data.uid == request.auth.uid;
      allow update: if request.auth != null && (
        (request.writeFields.size() == 1 &&
         request.writeFields.hasOnly(['likeCount'])) ||
        request.writeFields.hasOnly(["poll"]) ||
        (request.writeFields.hasOnly(['donations'])) ||
        (request.writeFields.size() == 1 &&
          (request.writeFields.hasOnly(['commentCount']) ||
           request.writeFields.hasOnly(['retweetCount']))) ||
        (request.writeFields.size() == 1 &&
          request.writeFields.hasOnly(['viewsCount']) &&
          request.resource.data.viewsCount == resource.data.viewsCount + 1) ||
        request.writeFields.hasOnly(["text", "title", "edited", "language"]) ||
        request.writeFields.hasOnly(["connectedWynt"]) ||
        request.writeFields.hasOnly(["WS"])
      );

      allow delete: if request.auth != null && (
        resource.data.uid == request.auth.uid ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin']
      );

      // Likes
      match /likes/{userId} {
        allow read: if true;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete: if request.auth != null && (
          request.auth.uid == userId ||
          request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin']);
      }
      
      //votes
      match /votes/{userId} {
        allow read: if true;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete, update: if false;
      }

      //views
      match /views/{userId} {
        allow read: if true;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete: if request.auth != null && (
          request.auth.uid == userId ||
          request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin']);
      }

      // Comments
      match /comments/{commentId} {
        allow read: if true;

        allow create: if request.auth != null &&
          request.resource.data.uid == request.auth.uid;

        allow update: if request.auth != null && (
          (request.writeFields.size() == 1 &&
           request.writeFields.hasOnly(['likeCount'])) ||
          (request.writeFields.size() == 1 &&
           request.writeFields.hasOnly(['replyCount'])) ||
          (request.writeFields.size() == 1 &&
           request.writeFields.hasOnly(['retweetCount'])) ||
           request.writeFields.hasOnly(['isHidden']) ||
           request.writeFields.hasOnly(['ownerReplied']) ||
           request.writeFields.hasOnly(['ownerReplying']) ||
           request.writeFields.hasOnly(["text", "edited", "language"]) ||
           request.writeFields.hasOnly(["pinned", "hasBeenPinned"]) ||
           request.writeFields.hasOnly(["ownerReplied", "replyCount"]) ||
          ((request.auth.uid == resource.data.uid) &&
            request.writeFields.size() == 1 &&
            request.writeFields.hasOnly(['text'])) ||
          (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin'])
        );      
        
        allow delete: if request.auth != null && (
          request.auth.uid == resource.data.uid ||
          request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid ||
          get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin']);

        // Comment likes
        match /likes/{userId} {
          allow read: if true;
          allow create: if request.auth != null && request.auth.uid == userId;
          allow delete: if request.auth != null && (
            request.auth.uid == userId ||
            request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid ||
            get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin']);
        }
        
        match /votes/{userId} {
          allow read: if true;
          allow create: if request.auth != null && request.auth.uid == userId;
          allow delete, update: if false;
        }
      }
    }
  }
}
```

## firestore indexes

| Collection ID | Fields indexed                                               | Query scope  |
|---------------|--------------------------------------------------------------|--------------|
| comments      | `likeCount ↑`, `createdAt ↓`, `__name__ ↓`                   | Collection   |
| tweets        | `uid ↑`, `createdAt ↓`, `__name__ ↓`                         | Collection   |
| tweets        | `likeCount ↓`, `createdAt ↑`, `__name__ ↑`                   | Collection   |
| tweets        | `likeCount ↓`, `createdAt ↓`, `__name__ ↓`                   | Collection   |
| tweets        | `searchTokens []`, `createdAt ↓`, `__name__ ↓`               | Collection   |
| posts         | `searchTokens []`, `createdAt ↓`, `__name__ ↓`               | Collection   |
| comments      | `parentId ↑`, `likeCount ↓`, `createdAt ↓`, `__name__ ↓`     | Collection   |
| comments      | `searchTokens []`, `parentId ↑`, `createdAt ↓`, `__name__ ↓` | Collection   |
| communities   | `members []`, `lowerCase ↑`, `__name__ ↑`                    | Collection   |
| tweets        | `retweetOf ↑`, `likeCount ↓`, `__name__ ↓`                   | Collection   | 

## supabase policies

| Policy name         | target roles | expression                    |
|---------------------|--------------|-------------------------------|
| allow_public_read   | anon         | `(bucket_id = 'wints'::text)` |
| allow_public_upload | anon         | `(bucket_id = 'wints'::text)` |
| allow_public_delete | anon         | `(bucket_id = 'wints'::text)` |

<hr>

Created by Nackoo
