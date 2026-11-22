import { useLocalSearchParams } from 'expo-router';
import { WorkflowCanvas } from '@/components/workflow-canvas';

export default function CanvasScreen() {
    const { showGmailConnection } = useLocalSearchParams<{ showGmailConnection?: string | string[] }>();
    const openGmailConnection = Array.isArray(showGmailConnection) ? showGmailConnection[0] === '1' : showGmailConnection === '1';
    return <WorkflowCanvas showGmailConnection={openGmailConnection} />;
}
