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
  
    function isUserAdmin(uid) {
      return request.auth != null &&
        get(/databases/$(database)/documents/users/$(uid)).data.role == "admin";
    }
    
    function isCommunityModerator(communityId) {
      let community = get(/databases/$(database)/documents/communities/$(communityId)).data;

      return request.auth != null && (
        community.creatorId == request.auth.uid ||
        request.auth.uid in community.admin ||
        request.auth.uid == resource.data.creatorId
      );
    }

    match /banned/{userId} {
      allow read: if request.auth != null;
      allow create, delete: if request.auth != null && isUserAdmin(request.auth.uid); 
      allow update: if false; 
    }

    match /communities/{communityId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.resource.data.creatorId == request.auth.uid
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0;

      allow update: if request.auth != null && (
        request.writeFields.hasOnly(["membersCount", "members"]) ||
        request.writeFields.hasOnly(["posts"]) ||
        request.writeFields.hasOnly(["admin"]) ||
        request.writeFields.hasOnly(["pinned"]) ||
        request.writeFields.hasOnly(["name", "lowerCase", "description", "banner", "avatar", "acceptingApplications", "private", "tags", "requirements", "rules"])
      );

      allow delete: if request.auth != null && (
        resource.data.creatorId == request.auth.uid || isUserAdmin(request.auth.uid)
      );
      
      match /members/{userId} {
        allow create, read, delete: if request.auth != null;
        allow update: if isCommunityModerator(communityId);
      }
      
      match /bans/{userId} {
        allow create, read, delete: if request.auth != null;
        allow update: if false;
      }
    }
    
    match /communities/{communityId}/posts/{postId} {
      allow read: if request.auth != null;

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
        request.writeFields.hasOnly(["text", "title", "edited", "language", "editAfterComment"]) ||
        request.writeFields.hasOnly(["connectedWynt", "postedInPublic"]) ||
        request.writeFields.hasOnly(["WS"]) 
      );

      allow delete: if request.auth != null && (
        resource.data.uid == request.auth.uid ||
        isUserAdmin(request.auth.uid) ||
        isCommunityModerator(communityId)
      );

      match /likes/{userId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete: if request.auth != null && request.auth.uid == userId;
      }

      match /votes/{userId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete, update: if false;
      }
      
      match /views/{userId} {
        allow read: if request.auth != null;
        allow delete: if false;
        allow create: if request.auth != null && request.auth.uid == userId;
      }
    }
    
    match /communities/{communityId}/posts/{postId}/comments/{commentId} {
      allow read: if request.auth != null;

      allow create: if request.auth != null &&
        request.resource.data.uid == request.auth.uid;

      allow update: if request.auth != null && (
        (resource.data.uid == request.auth.uid &&
        request.writeFields.hasOnly(['text', 'edited', "language", "editAfterComment"])) ||
        request.writeFields.hasOnly(['replyCount', 'ownerReplied']) ||
        request.writeFields.hasOnly(['likeCount']) ||
        request.writeFields.hasOnly(['replyCount']) ||
        request.writeFields.hasOnly(['viewsCount']) ||
        request.writeFields.hasOnly(['retweetCount']) ||
        request.writeFields.hasOnly(['isHidden', 'hiddenByAuthority', 'hiddenReason']) ||
        request.writeFields.hasOnly(['isHidden', 'hiddenByAdmin', 'hiddenReason']) ||
        request.writeFields.hasOnly(['isHidden', 'hiddenReason']) ||
        request.writeFields.hasOnly(['isHidden', 'hiddenByAdmin', 'hiddenReason', 'hiddenByAuthority']) ||
        request.writeFields.hasOnly(['ownerReplied']) ||
        request.writeFields.hasOnly(['ownerReplying']) ||
        request.writeFields.hasOnly(['pinned', 'hasBeenPinned']) ||
        isUserAdmin(request.auth.uid)
      );

      allow delete: if request.auth != null && (
        resource.data.uid == request.auth.uid ||
        isUserAdmin(request.auth.uid) ||
        isCommunityModerator(communityId)
      );

      match /likes/{userId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete: if request.auth != null && request.auth.uid == userId;
      }
      
      match /votes/{userId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete, update: if false;
      }
      
      match /views/{userId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete: if false
      }
    }
    
    match /susList/{userId} {
      allow create, read, update: if request.auth != null && isUserAdmin(request.auth.uid);
      allow delete: if false; 
    }

    match /tags/{tagId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null;

      match /tweets/{tweetId} {
        allow read: if request.auth != null;
        allow create, update: if request.auth != null;
        allow delete: if request.auth != null;
      }
    }

    match /users/{userId} {
      allow read: if request.auth != null;
        allow update: if request.auth != null && (
          (request.auth.uid == userId && request.writeFields.hasOnly(["posts"])) ||
          (request.writeFields.hasOnly(["balance"]) &&
          request.resource.data.balance is int &&
          request.resource.data.balance > resource.data.balance) ||
          (request.writeFields.hasOnly(["followers"])) ||
          (isUserAdmin(request.auth.uid) &&
          request.writeFields.hasOnly(["banReason"])) ||
          request.writeFields.hasOnly(["communitiesCount"]) ||
          (isUserAdmin(request.auth.uid) &&
          request.writeFields.hasAll(["posts"])) ||
          !("role" in request.resource.data.diff(resource.data).affectedKeys()));
        allow write: if request.auth != null &&
         !("role" in request.resource.data.keys()) &&
         (request.auth.uid == userId ||
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin");
        allow delete: if false;
        
      match /mentioned/{tweetId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null &&
          exists(/databases/$(database)/documents/tweets/$(tweetId)) &&
          userId in get(/databases/$(database)/documents/tweets/$(tweetId)).data.mentions;
        allow delete: if request.auth != null &&
          exists(/databases/$(database)/documents/tweets/$(tweetId)) &&
          (request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid || isUserAdmin(request.auth.uid)
          );
      }
      
      match /blocks/{userId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null;
      }
      
      match /posts/{postId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && (
          request.auth.uid == userId ||
          isUserAdmin(request.auth.uid)
        );
      }
      
      //SAFE
      match /notifications/{notificationId} {
        allow create, read: if request.auth != null;

        allow delete: if request.auth != null
          && request.auth.uid == userId
          && !(
            resource.data.type in [
              "community-delete",
              "comment-delete",
              "community-reply-delete",
              "community-tweet-delete",
              "tweet"
            ]
          );

        allow update: if request.auth != null
  				&& request.resource.data.type == resource.data.type;
      }

      match /bookmarks/{folderId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && request.auth.uid == userId;
        match /items/{tweetId} {
          allow read: if true;
          allow write: if request.auth != null && request.auth.uid == userId;
        }
      }
      
      match /highlights/{tweetId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && request.auth.uid == userId;
      }
      
      match /following/{targetId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && request.auth.uid == userId;
      }

      match /followers/{followerId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && request.auth.uid == followerId;
      }
    }

    match /tweets/{tweetId} {
      allow read: if request.auth != null;
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
        request.writeFields.hasOnly(["text", "title", "edited", "language", "editAfterComment"]) ||
        request.writeFields.hasOnly(["connectedWynt", "postedInPublic"]) ||
        request.writeFields.hasOnly(["WS"])
      );

      allow delete: if request.auth != null && (
        resource.data.uid == request.auth.uid ||
        isUserAdmin(request.auth.uid)
      );

      match /likes/{userId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete: if request.auth != null && (
          request.auth.uid == userId ||
          request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid ||
          isUserAdmin(request.auth.uid)
        );
      }
      
      match /votes/{userId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete, update: if false;
      }

      match /views/{userId} {
        allow read: if request.auth != null;
        allow create: if request.auth != null && request.auth.uid == userId;
        allow delete: if false
      }

      match /comments/{commentId} {
        allow read: if request.auth != null;

        allow create: if request.auth != null &&
          request.resource.data.uid == request.auth.uid;

        allow update: if request.auth != null && (
          (request.writeFields.size() == 1 &&
           request.writeFields.hasOnly(['likeCount'])) ||
           request.writeFields.hasOnly(['viewsCount']) ||
          (request.writeFields.size() == 1 &&
           request.writeFields.hasOnly(['replyCount'])) ||
          (request.writeFields.size() == 1 &&
           request.writeFields.hasOnly(['retweetCount'])) ||
           request.writeFields.hasOnly(['isHidden', 'hiddenByAuthority', 'hiddenReason']) ||
           request.writeFields.hasOnly(['isHidden', 'hiddenReason']) ||
           request.writeFields.hasOnly(['isHidden', 'hiddenByAdmin', 'hiddenReason', 'hiddenByAuthority']) ||
           request.writeFields.hasOnly(['ownerReplied']) ||
           request.writeFields.hasOnly(['ownerReplying']) ||
           request.writeFields.hasOnly(["text", "edited", "language", "editAfterComment"]) ||
           request.writeFields.hasOnly(["pinned", "hasBeenPinned"]) ||
           request.writeFields.hasOnly(["ownerReplied", "replyCount"]) ||
          ((request.auth.uid == resource.data.uid) &&
            request.writeFields.size() == 1 &&
            request.writeFields.hasOnly(['text'])) ||
          isUserAdmin(request.auth.uid)
        );      
        
        allow delete: if request.auth != null && (
          request.auth.uid == resource.data.uid ||
          request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid ||
          isUserAdmin(request.auth.uid)
        );

        match /likes/{userId} {
          allow read: if request.auth != null;
          allow create: if request.auth != null && request.auth.uid == userId;
          allow delete: if request.auth != null && (
            request.auth.uid == userId ||
            request.auth.uid == get(/databases/$(database)/documents/tweets/$(tweetId)).data.uid ||
            isUserAdmin(request.auth.uid)
          );
        }
        
        match /votes/{userId} {
          allow read: if request.auth != null;
          allow create: if request.auth != null && request.auth.uid == userId;
          allow delete, update: if false;
        }
        
        match /views/{userId} {
          allow read: if request.auth != null;
          allow create: if request.auth != null && request.auth.uid == userId;
          allow delete: if false
        }
      }
    }
  }
}
```

## firestore indexes

| Collection ID | Fields indexed                                               | Query scope  |
|---------------|--------------------------------------------------------------|--------------|
| comments      | `parentId ↑`, `likeCount ↓`, `createdAt ↓`, `__name__ ↓`     | Collection   |
| comments      | `likeCount ↓`, `createdAt ↓`, `__name__ ↓`                   | Collection   |
| comments      | `parentId ↑`, `uid ↑`, `__name__ ↑`                          | Collection   |
| comments      | `likeCount ↓`, `createdAt ↑`, `__name__ ↑`                   | Collection   |
| comments      | `searchTokens []`. `parentId ↑`, `createdAt ↓`, `__name__ ↓` | Collection   |
| communities   | `lowerCase ↑`, `createdAt ↓`, `__name__ ↓`                   | Collection   |
| communities   | `members []`, `lowerCase ↑`, `__name__ ↑`                    | Collection   |
| posts         | `searchTokens []`, `createdAt ↓`, `__name__ ↓`               | Collection   |
| posts         | `retweetOf ↑`, `likeCount ↓`, `__name__ ↓`                   | Collection   |
| posts         | `retweetOfComment.commentId ↑`, `likeCount ↓`, `__name__ ↓`  | Collection   |
| tweets        | `uid ↑`, `createdAt ↓`, `__name__ ↓`                         | Collection   |
| tweets        | `likeCount ↓`, `createdAt ↓`, `__name__ ↓`                   | Collection   |
| tweets        | `searchTokens []`, `createdAt ↓`, `__name__ ↓`               | Collection   |
| tweets        | `retweetOf ↑`, `likeCount ↓`, `__name__ ↓`                   | Collection   |
| tweets        | `retweetOfComment.commentId ↑`, `likeCount ↓`, `__name__ ↓`  | Collection   |

## supabase policies

| Policy name         | target roles | expression                    |
|---------------------|--------------|-------------------------------|
| allow_public_read   | anon         | `(bucket_id = 'wints'::text)` |
| allow_public_upload | anon         | `(bucket_id = 'wints'::text)` |
| allow_public_delete | anon         | `(bucket_id = 'wints'::text)` |

<hr>

Created by Nackoo
