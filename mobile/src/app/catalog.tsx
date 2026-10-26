import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useCourses } from '../api/hooks';
import { CourseCard } from '../components/cards';
import { Chip, Row } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'english', label: 'English' },
  { id: 'coding', label: 'Coding' },
  { id: 'ai', label: 'AI' },
  { id: 'interview', label: 'Interviews' },
  { id: 'aptitude', label: 'Aptitude' },
  { id: 'professional', label: 'Professional' },
];

export default function Catalog() {
  const t = useTheme();
  const router = useRouter();
  const courses = useCourses();
  const [filter, setFilter] = useState('all');
  const data = useMemo(() => (courses.data ?? []).filter((c) => filter === 'all' || c.tracks.includes(filter)), [courses.data, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        data={data}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        ListHeaderComponent={
          <Row style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
            {FILTERS.map((f) => (
              <Chip key={f.id} label={f.label} selected={filter === f.id} onPress={() => setFilter(f.id)} />
            ))}
          </Row>
        }
        ListEmptyComponent={
          courses.isPending ? (
            <LoadingState lines={0} cards={4} label="Loading courses" />
          ) : courses.error ? (
            <ErrorState error={courses.error} onRetry={() => void courses.refetch()} />
          ) : (
            <EmptyState title="Nothing here yet" message="No courses match this filter. Try another one." />
          )
        }
        refreshing={courses.isRefetching}
        onRefresh={() => void courses.refetch()}
        renderItem={({ item }) => <CourseCard course={item} onPress={() => router.push(`/course/${item.id}`)} />}
      />
    </View>
  );
}
